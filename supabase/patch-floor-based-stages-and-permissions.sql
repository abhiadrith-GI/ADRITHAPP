-- ============================================================================
-- PATCH — floor-based construction stages, plus the finalized permission
-- model (only the project's designer can mark checkpoints or sign off;
-- everyone else can still attach photos freely; only license-verified
-- Engineers/Architects can become a designer at all).
--
-- Run this once in the Supabase SQL Editor. schema.sql (the master file)
-- already has all of this folded in — this patch brings an already-running
-- database up to match it, same pattern as the two earlier patches.
--
-- What this replaces:
--   - The old fixed 6-stage list (Foundation, Steel, RCC Casting,
--     Brickwork, Plastering, Finishing) is gone entirely. In its place:
--     Foundation (7 stages, once, whole building) + a 5-stage cycle
--     (Column, Brickwork, Lintel, Slab & Beam, Plastering) that repeats
--     for every floor, added on demand via add_next_floor as construction
--     actually reaches that point.
--   - Checkpoint Pass/Fail/Flag, not just final sign-off, is now
--     restricted to this project's nominated designer (or a platform
--     admin) — enforced at the database level, not just hidden in the UI.
--     Photo evidence upload is untouched, still open to every member.
--   - Being nominated as a designer now requires license_verified = true
--     on that account, in addition to the right role — also enforced at
--     the database level, silently, same pattern as other locked fields.
--
-- This entire structure — every stage, every checkpoint, every permission
-- rule — came directly from the architect using this platform, confirmed
-- back to them stage by stage and corrected wherever they said so, not
-- written from general research. Every piece below was tested against
-- real Postgres with RLS genuinely enforced (not bypassed by a superuser
-- connection, which was itself a bug caught and fixed during testing)
-- before being written up here.
--
-- Safe to run against a live database: no existing project's data is
-- deleted or altered by this patch. Existing projects keep whatever
-- stages they already have; only new projects and newly-added floors use
-- the new structure going forward.
-- ============================================================================

-- New columns.
alter table checklist_stages add column if not exists floor_number int;
alter table projects add column if not exists requested_floor_count int not null default 0;

create or replace function enforce_designer_eligibility()
returns trigger as $$
declare
  target_verified boolean;
begin
  if new.is_project_designer then
    select license_verified into target_verified from profiles where id = new.user_id;

    if not (new.role_on_project in ('engineer', 'architect') and coalesce(target_verified, false)) then
      new.is_project_designer := false;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_designer_eligibility_trigger on project_members;

create trigger enforce_designer_eligibility_trigger
  before insert or update on project_members
  for each row execute function enforce_designer_eligibility();

-- Lets a project's creator look up an already-registered user by email, to
-- add them as a member (Contractor and Owner accounts must already exist
-- before they can be added — no invite-by-email-to-a-stranger flow).
-- Exposes only what's needed for that (name, role, verification status) —
-- nothing else from auth.users is ever surfaced this way.
create or replace function find_user_by_email(lookup_email text)
returns table (id uuid, full_name text, role user_role, license_verified boolean)
as $$
  select p.id, p.full_name, p.role, p.license_verified
  from profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower(lookup_email)
  limit 1;
$$ language sql security definer stable;

grant execute on function find_user_by_email(text) to authenticated;


create or replace function create_default_stages_and_checkpoints(
  target_project_id uuid,
  start_stage_key text default 'layout',
  initial_floor_count int default 0
)
returns void as $$
declare
  foundation_defs jsonb := '[
    {"key":"layout","name":"Site Layout","checkpoints":[
      {"d":"Confirm the building layout and column centre-lines match the approved drawing","r":"Per structural drawing"}
    ]},
    {"key":"excavation_soil","name":"Excavation & Soil Test","checkpoints":[
      {"d":"Confirm excavation depth matches the drawing, and the soil at the base looks firm and undisturbed, with no loose fill or standing water","r":"IS 1904"}
    ]},
    {"key":"pcc","name":"PCC","checkpoints":[
      {"d":"Confirm the plain cement concrete (PCC) base layer is laid evenly before footing steel starts","r":"IS 456:2000"}
    ]},
    {"key":"footing_steel","name":"Footing Steel","checkpoints":[
      {"d":"Confirm footing reinforcement — bar diameter, spacing, and cover — matches the drawing","r":"IS 456:2000, Table 16"}
    ]},
    {"key":"footing_concrete","name":"Footing Concreting","checkpoints":[
      {"d":"Confirm the concrete grade matches the drawing, a cube sample was taken, and curing has started","r":"IS 456:2000"}
    ]},
    {"key":"plinth_beam_steel","name":"Plinth Beam Steel","checkpoints":[
      {"d":"Confirm plinth beam reinforcement — bar diameter, spacing, and lap length — matches the drawing","r":"IS 456:2000"}
    ]},
    {"key":"plinth_beam_concrete","name":"Plinth Beam Concreting","checkpoints":[
      {"d":"Confirm the plinth beam concrete grade matches the drawing, a cube sample was taken, and curing has started","r":"IS 456:2000"}
    ]}
  ]'::jsonb;
  floor_defs jsonb := '[
    {"key":"column","name":"Column","checkpoints":[
      {"d":"Confirm column reinforcement — bar diameter, spacing, and ties — matches the drawing","r":"IS 456:2000"},
      {"d":"Confirm the concrete grade matches the drawing, a cube sample was taken, and curing has started","r":"IS 456:2000"}
    ]},
    {"key":"brickwork","name":"Brickwork","checkpoints":[
      {"d":"Confirm brick/block type, mortar joint thickness, and wall plumb (verticality) are all consistent with the specification","r":"IS 2212"}
    ]},
    {"key":"lintel","name":"Lintel","checkpoints":[
      {"d":"Confirm lintel reinforcement and bearing length over the opening match the drawing before concreting","r":"IS 456:2000"}
    ]},
    {"key":"slab_beam","name":"Slab & Beam","checkpoints":[
      {"d":"Confirm slab and beam reinforcement, spacing, and cover match the drawing","r":"IS 456:2000"},
      {"d":"Confirm the concrete grade matches the drawing, a cube sample was taken, and curing has started","r":"IS 456:2000"}
    ]},
    {"key":"plastering","name":"Plastering","checkpoints":[
      {"d":"Confirm the wall surface was properly cleaned and wetted, and the first coat thickness looks consistent","r":"IS 1661"},
      {"d":"Confirm the final coat is complete, with no visible cracking after initial curing","r":"IS 2402"}
    ]}
  ]'::jsonb;
  stage jsonb;
  cp jsonb;
  new_stage_id uuid;
  idx int := 0;
  floor_num int;
  floor_label text;
  reached_start boolean := false;
  computed_status stage_status;
begin
  -- Foundation first — floor_number is null, happens once.
  for stage in select * from jsonb_array_elements(foundation_defs)
  loop
    if stage->>'key' = start_stage_key then
      computed_status := 'in_progress';
      reached_start := true;
    elsif reached_start then
      computed_status := 'locked';
    else
      computed_status := 'not_tracked';
    end if;

    insert into checklist_stages (project_id, stage_key, display_name, order_index, status, unlocked_at, floor_number)
    values (
      target_project_id, stage->>'key', stage->>'name', idx, computed_status,
      case when computed_status = 'in_progress' then now() else null end, null
    )
    returning id into new_stage_id;

    for cp in select * from jsonb_array_elements(stage->'checkpoints')
    loop
      insert into checkpoints (stage_id, description, standard_reference, order_index)
      values (new_stage_id, cp->>'d', cp->>'r', 0);
    end loop;

    idx := idx + 1;
  end loop;

  -- Then each floor already known to exist (0 = Ground, 1 = 1st, ...) — for
  -- an ordinary new project this is just Ground Floor (initial_floor_count
  -- defaults to 0). Joining a project already several floors in seeds all
  -- of them at once here; anything further comes later via add_next_floor.
  for floor_num in 0..initial_floor_count loop
    floor_label := case floor_num
      when 0 then 'Ground Floor'
      when 1 then '1st Floor'
      when 2 then '2nd Floor'
      when 3 then '3rd Floor'
      else floor_num || 'th Floor'
    end;

    for stage in select * from jsonb_array_elements(floor_defs)
    loop
      if 'f' || floor_num || '_' || (stage->>'key') = start_stage_key then
        computed_status := 'in_progress';
        reached_start := true;
      elsif reached_start then
        computed_status := 'locked';
      else
        computed_status := 'not_tracked';
      end if;

      insert into checklist_stages (project_id, stage_key, display_name, order_index, status, unlocked_at, floor_number)
      values (
        target_project_id,
        'f' || floor_num || '_' || (stage->>'key'),
        floor_label || ' — ' || (stage->>'name'),
        idx, computed_status,
        case when computed_status = 'in_progress' then now() else null end,
        floor_num
      )
      returning id into new_stage_id;

      for cp in select * from jsonb_array_elements(stage->'checkpoints')
      loop
        insert into checkpoints (stage_id, description, standard_reference, order_index)
        values (new_stage_id, cp->>'d', cp->>'r', 0);
      end loop;

      idx := idx + 1;
    end loop;
  end loop;

  if not reached_start then
    raise exception 'Invalid start_stage_key: % is not one of the seeded stages', start_stage_key;
  end if;
end;
$$ language plpgsql security definer;

-- Adds the next floor's five stages (Column, Brickwork, Lintel, Slab & Beam,
-- Plastering) once construction actually reaches that point. Only this
-- project's nominated designer or a platform admin can call it, and only
-- once the current topmost floor's Slab & Beam has actually been signed
-- off — matches real sequence: the next floor's columns don't start until
-- the floor below is cast and cured.
create or replace function add_next_floor(target_project_id uuid)
returns void as $$
declare
  current_max_floor int;
  next_floor int;
  floor_label text;
  slab_beam_status stage_status;
  stage jsonb;
  cp jsonb;
  new_stage_id uuid;
  next_order int;
  floor_defs jsonb := '[
    {"key":"column","name":"Column","checkpoints":[
      {"d":"Confirm column reinforcement — bar diameter, spacing, and ties — matches the drawing","r":"IS 456:2000"},
      {"d":"Confirm the concrete grade matches the drawing, a cube sample was taken, and curing has started","r":"IS 456:2000"}
    ]},
    {"key":"brickwork","name":"Brickwork","checkpoints":[
      {"d":"Confirm brick/block type, mortar joint thickness, and wall plumb (verticality) are all consistent with the specification","r":"IS 2212"}
    ]},
    {"key":"lintel","name":"Lintel","checkpoints":[
      {"d":"Confirm lintel reinforcement and bearing length over the opening match the drawing before concreting","r":"IS 456:2000"}
    ]},
    {"key":"slab_beam","name":"Slab & Beam","checkpoints":[
      {"d":"Confirm slab and beam reinforcement, spacing, and cover match the drawing","r":"IS 456:2000"},
      {"d":"Confirm the concrete grade matches the drawing, a cube sample was taken, and curing has started","r":"IS 456:2000"}
    ]},
    {"key":"plastering","name":"Plastering","checkpoints":[
      {"d":"Confirm the wall surface was properly cleaned and wetted, and the first coat thickness looks consistent","r":"IS 1661"},
      {"d":"Confirm the final coat is complete, with no visible cracking after initial curing","r":"IS 2402"}
    ]}
  ]'::jsonb;
begin
  if not (current_user_is_project_designer(target_project_id) or current_user_is_admin()) then
    raise exception 'Only this project''s nominated designer or a platform admin can add the next floor.';
  end if;

  select max(floor_number) into current_max_floor
  from checklist_stages where project_id = target_project_id and floor_number is not null;

  if current_max_floor is null then
    raise exception 'This project has no floors seeded yet.';
  end if;

  select status into slab_beam_status
  from checklist_stages
  where project_id = target_project_id and floor_number = current_max_floor and stage_key like '%_slab_beam';

  if slab_beam_status is distinct from 'approved' then
    raise exception 'The current top floor''s Slab & Beam must be signed off before adding the next floor.';
  end if;

  next_floor := current_max_floor + 1;
  floor_label := case next_floor
    when 1 then '1st Floor' when 2 then '2nd Floor' when 3 then '3rd Floor'
    else next_floor || 'th Floor'
  end;

  select coalesce(max(order_index), -1) + 1 into next_order
  from checklist_stages where project_id = target_project_id;

  for stage in select * from jsonb_array_elements(floor_defs)
  loop
    insert into checklist_stages (project_id, stage_key, display_name, order_index, status, unlocked_at, floor_number)
    values (
      target_project_id,
      'f' || next_floor || '_' || (stage->>'key'),
      floor_label || ' — ' || (stage->>'name'),
      next_order,
      'locked',
      null,
      next_floor
    )
    returning id into new_stage_id;

    for cp in select * from jsonb_array_elements(stage->'checkpoints')
    loop
      insert into checkpoints (stage_id, description, standard_reference, order_index)
      values (new_stage_id, cp->>'d', cp->>'r', 0);
    end loop;

    next_order := next_order + 1;
  end loop;

  -- The new floor's first stage (Column) starts in_progress immediately —
  -- the gate condition (previous floor's Slab & Beam approved) was already
  -- checked above before any of this ran. Everything after it starts
  -- locked and unlocks in turn via the existing sign-off trigger.
  update checklist_stages set status = 'in_progress', unlocked_at = now()
    where project_id = target_project_id and floor_number = next_floor
      and order_index = (select min(order_index) from checklist_stages where project_id = target_project_id and floor_number = next_floor);
end;
$$ language plpgsql security definer;

grant execute on function add_next_floor(uuid) to authenticated;

create or replace function finalize_project_setup(target_project_id uuid)
returns void as $$
declare
  requested_key text;
  requested_floors int;
begin
  select requested_start_stage_key, requested_floor_count
    into requested_key, requested_floors
  from projects where id = target_project_id;

  if requested_key is null or requested_key = 'layout' then
    perform create_default_stages_and_checkpoints(target_project_id, 'layout', coalesce(requested_floors, 0));
    return;
  end if;

  if current_user_is_project_designer(target_project_id) or current_user_is_admin() then
    perform create_default_stages_and_checkpoints(target_project_id, requested_key, coalesce(requested_floors, 0));
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
  requested_floors int;
  already_seeded boolean;
begin
  if not (current_user_is_project_designer(target_project_id) or current_user_is_admin()) then
    raise exception 'Only this project''s nominated designer or a platform admin can confirm the starting stage.';
  end if;

  select exists(select 1 from checklist_stages where project_id = target_project_id) into already_seeded;
  if already_seeded then
    raise exception 'This project''s stages have already been set up.';
  end if;

  select requested_start_stage_key, requested_floor_count
    into requested_key, requested_floors
  from projects where id = target_project_id;

  perform create_default_stages_and_checkpoints(
    target_project_id, coalesce(requested_key, 'layout'), coalesce(requested_floors, 0)
  );

  update projects set start_stage_pending = false where id = target_project_id;
end;
$$ language plpgsql security definer;

grant execute on function approve_project_start_stage(uuid) to authenticated;

drop policy if exists "members can update checkpoint status in their projects" on checkpoints;
drop policy if exists "only the project's designer can update checkpoint status" on checkpoints;

create policy "only the project's designer can update checkpoint status"
  on checkpoints for update
  to authenticated
  using (
    current_user_is_project_designer((select project_id from checklist_stages where id = stage_id))
    or current_user_is_admin()
  )
  with check (
    current_user_is_project_designer((select project_id from checklist_stages where id = stage_id))
    or current_user_is_admin()
  );

-- Patch complete.
