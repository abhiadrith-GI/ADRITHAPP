-- ============================================================================
-- PATCH — "start from any stage" feature.
-- Run this once in the Supabase SQL Editor against the LIVE database.
-- schema.sql (the master file) already has all of this folded in — this
-- patch just brings an already-running database up to match it, the same
-- way patch-signoff-designer-check.sql did for the earlier sign-off fix.
--
-- What this adds:
--   1. A new 'not_tracked' stage status — for stages before wherever a
--      project chose to start tracking from.
--   2. Two new columns on projects: requested_start_stage_key and
--      start_stage_pending.
--   3. A rewritten create_default_stages_and_checkpoints that can start a
--      project at any stage, not only Foundation.
--   4. Removal of the old on_project_created trigger, replaced by two
--      functions the client calls explicitly: finalize_project_setup and
--      approve_project_start_stage. (The trigger fired too early to check
--      designer status — see the comment on finalize_project_setup below
--      for the full reasoning.)
-- Safe to run even though the app is live: no existing data is touched,
-- and every existing project already has its checklist_stages seeded, so
-- nothing here recomputes or overwrites anything for projects that already
-- exist.
-- ============================================================================

-- 1. New stage status.
alter type stage_status add value if not exists 'not_tracked';

-- 2. New project columns.
alter table projects add column if not exists requested_start_stage_key text;
alter table projects add column if not exists start_stage_pending boolean not null default false;

-- 3 & 4. Drop the old trigger (see finalize_project_setup's comment for why),
-- then install the rewritten seeding function plus the two new functions.
drop trigger if exists on_project_created_trigger on projects;
drop function if exists on_project_created();

create or replace function create_default_stages_and_checkpoints(
  target_project_id uuid,
  start_stage_key text default 'foundation'
)
returns void as $$
declare
  stage_defs jsonb := '[
    {"key":"foundation","name":"Foundation","checkpoints":[
      {"d":"Confirm excavation depth and layout match the approved drawing","r":"Per structural drawing"},
      {"d":"Confirm the soil at the base looks firm and undisturbed, with no loose fill or standing water","r":"IS 1904"},
      {"d":"Confirm the plain cement concrete (PCC) base layer is laid evenly before footing steel starts","r":"IS 456:2000"}
    ]},
    {"key":"steel","name":"Steel Reinforcement","checkpoints":[
      {"d":"Confirm the TMT bar grade matches the drawing — check the rolled markings on the bars themselves","r":"IS 1786"},
      {"d":"Confirm the gap between the steel and the outer edge (cover) matches the required minimum","r":"IS 456:2000, Table 16"},
      {"d":"Confirm bar spacing and overlap length look consistent with the drawing","r":"IS 456:2000"}
    ]},
    {"key":"rcc_casting","name":"RCC Casting","checkpoints":[
      {"d":"Confirm the concrete grade/mix matches what is specified for this element","r":"IS 456:2000"},
      {"d":"Confirm a cube sample was taken during this pour, for later strength testing","r":"IS 456:2000"},
      {"d":"Confirm the pour was continuous, with no long unplanned gaps","r":"IS 456:2000"},
      {"d":"Confirm curing (keeping the concrete wet) has actually started","r":"IS 456:2000"}
    ]},
    {"key":"brickwork","name":"Brickwork","checkpoints":[
      {"d":"Confirm the brick or block type matches what is specified","r":"IS 1077 / IS 2212"},
      {"d":"Confirm mortar joints look consistent in thickness, not overly thick or uneven","r":"IS 2212"},
      {"d":"Confirm the wall looks vertically straight (plumb), not visibly leaning","r":"IS 2212"}
    ]},
    {"key":"plastering","name":"Plastering","checkpoints":[
      {"d":"Confirm the wall surface was properly cleaned and wetted before plastering started","r":"IS 1661"},
      {"d":"Confirm plaster thickness looks consistent, without visibly thin or thick patches","r":"IS 1661"},
      {"d":"Confirm no visible cracking has appeared after initial curing","r":"IS 2402"}
    ]},
    {"key":"finishing","name":"Finishing","checkpoints":[
      {"d":"Confirm finishing work matches what the owner and designer agreed on","r":"Project-specific — see note"},
      {"d":"Confirm the space is genuinely ready for handover (clean, functional, nothing visibly incomplete)","r":"Project-specific — see note"}
    ]}
  ]'::jsonb;
  stage jsonb;
  cp jsonb;
  new_stage_id uuid;
  idx int := 0;
  reached_start boolean := false;
  computed_status stage_status;
begin
  for stage in select * from jsonb_array_elements(stage_defs)
  loop
    if stage->>'key' = start_stage_key then
      computed_status := 'in_progress';
      reached_start := true;
    elsif reached_start then
      computed_status := 'locked';
    else
      computed_status := 'not_tracked';
    end if;

    insert into checklist_stages (project_id, stage_key, display_name, order_index, status, unlocked_at)
    values (
      target_project_id,
      stage->>'key',
      stage->>'name',
      idx,
      computed_status,
      case when computed_status = 'in_progress' then now() else null end
    )
    returning id into new_stage_id;

    for cp in select * from jsonb_array_elements(stage->'checkpoints')
    loop
      insert into checkpoints (stage_id, description, standard_reference, order_index)
      values (new_stage_id, cp->>'d', cp->>'r', 0);
    end loop;

    idx := idx + 1;
  end loop;

  if not reached_start then
    raise exception 'Invalid start_stage_key: % is not one of the six stage keys', start_stage_key;
  end if;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Stage seeding used to run automatically via an on_project_created trigger,
-- firing immediately after the projects row was inserted. That worked fine
-- when every project always started at Foundation — but "start from any
-- stage" needs to know whether the CREATOR is this project's designer, and
-- that lives on project_members, which the client only inserts in a second,
-- separate call right after creating the project. A trigger firing on the
-- projects insert would run before that row exists, so it could never
-- correctly check designer authorization. Replacing the trigger with an
-- explicit function the client calls once both inserts have succeeded.
--
-- finalize_project_setup: called right after project_members is inserted.
--   - No special start requested (null or 'foundation'): seeds immediately,
--     identical to the old always-Foundation behavior.
--   - A later stage requested, and the creator already has the authority to
--     confirm it (they're this project's nominated designer, or a platform
--     admin): seeds immediately, with earlier stages marked not_tracked.
--   - A later stage requested, creator does NOT have that authority: no
--     stages are created yet. start_stage_pending is set true, and the
--     project sits waiting for approve_project_start_stage below.
create or replace function finalize_project_setup(target_project_id uuid)
returns void as $$
declare
  requested_key text;
begin
  select requested_start_stage_key into requested_key
  from projects where id = target_project_id;

  if requested_key is null or requested_key = 'foundation' then
    perform create_default_stages_and_checkpoints(target_project_id, 'foundation');
    return;
  end if;

  if current_user_is_project_designer(target_project_id) or current_user_is_admin() then
    perform create_default_stages_and_checkpoints(target_project_id, requested_key);
  else
    update projects set start_stage_pending = true where id = target_project_id;
  end if;
end;
$$ language plpgsql security definer;

grant execute on function finalize_project_setup(uuid) to authenticated;

-- Called by this project's nominated designer, or a platform admin, to
-- confirm a pending "start from a later stage" request someone else made
-- at project creation. Re-checks authorization itself rather than trusting
-- the caller — the same "RLS/database is the real boundary, not the UI"
-- principle the sign-off fix above exists to enforce.
create or replace function approve_project_start_stage(target_project_id uuid)
returns void as $$
declare
  requested_key text;
  already_seeded boolean;
begin
  if not (current_user_is_project_designer(target_project_id) or current_user_is_admin()) then
    raise exception 'Only this project''s nominated designer or a platform admin can confirm the starting stage.';
  end if;

  select exists(select 1 from checklist_stages where project_id = target_project_id) into already_seeded;
  if already_seeded then
    raise exception 'This project''s stages have already been set up.';
  end if;

  select requested_start_stage_key into requested_key
  from projects where id = target_project_id;

  perform create_default_stages_and_checkpoints(target_project_id, coalesce(requested_key, 'foundation'));

  update projects set start_stage_pending = false where id = target_project_id;
end;
$$ language plpgsql security definer;

grant execute on function approve_project_start_stage(uuid) to authenticated;

-- Patch complete.
