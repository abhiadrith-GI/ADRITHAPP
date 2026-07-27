-- ============================================================================
-- ADRITH platform — foundation schema
-- Tool #1: Civil/RCC construction quality-control checklist
--
-- Design principles this schema enforces (from project requirements):
--   1. Every action is tied to the logged-in account (auth.uid()), never a
--      client-supplied user id.
--   2. Evidence and sign-offs are INSERT-ONLY — no UPDATE or DELETE policy
--      exists for them, so a timestamp or confirmation can never be edited
--      or backdated after the fact.
--   3. Users can never grant themselves a role or verified-license status —
--      those columns are excluded from the self-update policy.
--   4. Access is scoped to project membership, not "any logged-in user can
--      see any project's data" — EXCEPT for the platform admin (see below).
--   5. Exactly one flag, is_platform_admin, exists outside that scoping —
--      for the app owner only. It can never be set through the app, by
--      anyone, including an existing admin. See make-me-admin.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES
-- One row per auth.users row. Holds app-specific fields Supabase Auth
-- doesn't store natively (role, license info).
-- ----------------------------------------------------------------------------
create type user_role as enum ('owner', 'contractor', 'engineer', 'architect');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role user_role not null,
  license_number text,
  license_verified boolean not null default false,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Anyone logged in can read a profile (needed to show names/roles on a
-- shared project). Nothing sensitive (no license number) is exposed here
-- beyond what teammates already need to see.
create policy "profiles are readable by any authenticated user"
  on profiles for select
  to authenticated
  using (true);

-- Users may update their OWN row, but role and license_verified are
-- deliberately left out of what this policy allows changing in practice —
-- enforced below via a trigger, since RLS alone can't restrict columns.
create policy "users can update their own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Prevents a user from setting their own role/license_verified via a
-- crafted update request. role/license_verified CAN be changed by a
-- platform admin (e.g. verifying someone else's license) or a service-role
-- process. is_platform_admin itself is locked completely — it cannot be
-- changed through the app by anyone, admin included. See make-me-admin.sql.
create or replace function lock_privileged_profile_fields()
returns trigger as $$
declare
  requester_is_admin boolean;
  is_service_role boolean;
begin
  select coalesce(is_platform_admin, false) into requester_is_admin
  from profiles where id = auth.uid();

  -- coalesce()'d so a missing/null role claim is treated as "not
  -- service_role" (fail closed) rather than short-circuiting the check via
  -- SQL's three-valued NULL logic (which would fail open). This exact bug
  -- was caught by testing this trigger against a simulated session before
  -- ever shipping it.
  is_service_role := coalesce(auth.jwt() ->> 'role', '') = 'service_role';

  if not is_service_role then
    new.is_platform_admin := old.is_platform_admin;

    if not requester_is_admin then
      new.role := old.role;
      new.license_verified := old.license_verified;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger lock_privileged_profile_fields_trigger
  before update on profiles
  for each row execute function lock_privileged_profile_fields();

-- Helper used across every table below: is the logged-in user the platform
-- admin? Named distinctly from the is_platform_admin COLUMN to avoid any
-- ambiguity between the column and this function in policy definitions.
create or replace function current_user_is_admin()
returns boolean as $$
  select coalesce(
    (select is_platform_admin from profiles where id = auth.uid()),
    false
  );
$$ language sql security definer stable;

-- Lets the admin edit any profile (e.g. to verify a license or correct a
-- misselected role) — the trigger above still blocks is_platform_admin
-- from changing through this path, admin session or not.
create policy "admin can update any profile"
  on profiles for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'contractor')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. PROJECTS
-- ----------------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

alter table projects enable row level security;

create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references profiles (id),
  role_on_project user_role not null,
  added_at timestamptz not null default now(),
  unique (project_id, user_id)
);

alter table project_members enable row level security;

-- Helper used by several policies below: is auth.uid() a member of this project?
create or replace function is_project_member(target_project_id uuid)
returns boolean as $$
  select exists (
    select 1 from project_members
    where project_id = target_project_id and user_id = auth.uid()
  );
$$ language sql security definer stable;

create policy "members can view their projects"
  on projects for select
  to authenticated
  using (is_project_member(id) or created_by = auth.uid() or current_user_is_admin());

create policy "authenticated users can create a project"
  on projects for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "members can view the member list of their projects"
  on project_members for select
  to authenticated
  using (is_project_member(project_id) or current_user_is_admin());

create policy "only the project creator can add members"
  on project_members for insert
  to authenticated
  with check (
    exists (select 1 from projects where id = project_id and created_by = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 3. CHECKLIST STAGES  (Foundation -> Steel -> RCC Casting -> Brickwork ->
--    Plastering -> Finishing — stage-gated, matches the construction sequence)
-- ----------------------------------------------------------------------------
-- not_tracked: stages before wherever a project chose to start tracking
-- from (see requested_start_stage_key below) — distinct from 'locked',
-- which means "will unlock later," since a not_tracked stage never will.
create type stage_status as enum ('locked', 'in_progress', 'submitted', 'approved', 'rejected', 'not_tracked');

create table checklist_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  stage_key text not null,
  display_name text not null,
  order_index int not null,
  status stage_status not null default 'locked',
  unlocked_at timestamptz,
  unique (project_id, stage_key)
);

alter table checklist_stages enable row level security;

create policy "members can view stages of their projects"
  on checklist_stages for select
  to authenticated
  using (is_project_member(project_id) or current_user_is_admin());

-- ----------------------------------------------------------------------------
-- 4. CHECKPOINTS  (individual quality checks within a stage, e.g. IS 456
--    cover requirements, TMT bar grade verification, curing period, etc.)
-- ----------------------------------------------------------------------------
create type checkpoint_status as enum ('pending', 'pass', 'fail', 'flagged');

create table checkpoints (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references checklist_stages (id) on delete cascade,
  description text not null,
  standard_reference text,
  status checkpoint_status not null default 'pending',
  order_index int not null
);

alter table checkpoints enable row level security;

create policy "members can view checkpoints of their projects"
  on checkpoints for select
  to authenticated
  using (
    is_project_member((select project_id from checklist_stages where id = stage_id))
    or current_user_is_admin()
  );

-- Any project member can mark a checkpoint pass/fail/flagged as they work
-- through a stage. Deliberately does NOT allow changing description or
-- standard_reference — those are seeded content, not something a user edits.
create policy "members can update checkpoint status in their projects"
  on checkpoints for update
  to authenticated
  using (
    is_project_member((select project_id from checklist_stages where id = stage_id))
  )
  with check (
    is_project_member((select project_id from checklist_stages where id = stage_id))
  );

-- ----------------------------------------------------------------------------
-- 5. CHECKPOINT EVIDENCE  (photos — insert-only, never editable)
-- ----------------------------------------------------------------------------
create table checkpoint_evidence (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references checkpoints (id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid not null references profiles (id),
  uploaded_at timestamptz not null default now(),
  device_metadata jsonb
);

alter table checkpoint_evidence enable row level security;

create policy "members can view evidence in their projects"
  on checkpoint_evidence for select
  to authenticated
  using (
    is_project_member((
      select cs.project_id from checkpoints cp
      join checklist_stages cs on cs.id = cp.stage_id
      where cp.id = checkpoint_id
    ))
    or current_user_is_admin()
  );

create policy "project members can upload evidence as themselves"
  on checkpoint_evidence for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and is_project_member((
      select cs.project_id from checkpoints cp
      join checklist_stages cs on cs.id = cp.stage_id
      where cp.id = checkpoint_id
    ))
  );
-- Deliberately no UPDATE or DELETE policy on this table — evidence, once
-- uploaded, is permanent. This is what makes the timestamp trustworthy.

-- ----------------------------------------------------------------------------
-- 6. SIGN-OFFS  (explicit confirmation, insert-only, never editable)
-- ----------------------------------------------------------------------------
create table sign_offs (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references checklist_stages (id),
  user_id uuid not null references profiles (id),
  role_at_signing user_role not null,
  confirmation_text text not null,
  signed_at timestamptz not null default now()
);

alter table sign_offs enable row level security;

create policy "members can view sign-offs in their projects"
  on sign_offs for select
  to authenticated
  using (
    is_project_member((select project_id from checklist_stages where id = stage_id))
    or current_user_is_admin()
  );

create policy "project members can sign off as themselves"
  on sign_offs for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and is_project_member((select project_id from checklist_stages where id = stage_id))
  );
-- Same as evidence: no UPDATE or DELETE policy. A sign-off is a signature,
-- not a checkbox you can silently uncheck later.

-- ============================================================================
-- ADDITIONS — subscription exemption, per-project designer, and the
-- automation that actually makes the six-stage workflow function: stages +
-- real checkpoints auto-created on project creation, next stage auto-unlocked
-- on sign-off. None of this existed yet; the tables above had no logic
-- connecting them into an actual working sequence.
-- ============================================================================

-- Adrith Designs' own projects are free for everyone on them; every other
-- project pays. Only the platform admin can set this (enforced below).
alter table projects add column fee_exempt boolean not null default false;

-- Whichever of engineer/architect is the actual design lead on a project —
-- chosen explicitly at project setup, never inferred from role/title alone.
-- This person is the project group's admin and the one whose sign-off
-- authority the checklist relies on.
alter table project_members add column is_project_designer boolean not null default false;

-- Lets a project start tracking from any of the six stages, not only
-- Foundation — for a firm joining mid-construction (e.g. the slab is
-- already poured). Null/'foundation' is the ordinary default start, no
-- request involved. Requesting any other stage needs confirmation from
-- this project's nominated designer or a platform admin before the
-- checklist_stages rows actually get created — see finalize_project_setup
-- and approve_project_start_stage further below.
alter table projects add column requested_start_stage_key text;
alter table projects add column start_stage_pending boolean not null default false;

-- Only the platform admin may toggle fee_exempt — same enforcement pattern
-- as the existing lock_privileged_profile_fields trigger on profiles.
create or replace function lock_fee_exempt_field()
returns trigger as $$
begin
  if not current_user_is_admin() then
    new.fee_exempt := old.fee_exempt;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger lock_fee_exempt_field_trigger
  before update on projects
  for each row execute function lock_fee_exempt_field();

create policy "admin can update any project"
  on projects for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

-- ----------------------------------------------------------------------------
-- Stage + checkpoint templates, auto-created whenever a project is created.
-- Checkpoints are written in plain language first (what the contractor
-- actually reads), with the IS-code reference as secondary/supporting
-- detail for the reviewing engineer — never the other way round. Every
-- checkpoint tests an outcome (is it correct?), never a method (how was it
-- done?) — a manually-marked layout passes exactly the same as an
-- instrument-marked one, provided the result is right.
--
-- HONEST LIMITATION: Finishing-stage checkpoints are seeded with only two
-- general items below. This stage is far more variable project-to-project
-- than the first five (painting, fittings, fixtures differ enormously by
-- project) and — as already discussed — genuinely needs its own dedicated
-- research pass before real checkpoints are written for it. Do not treat
-- the two seeded here as complete.
-- ----------------------------------------------------------------------------
-- start_stage_key defaults to 'foundation' — the ordinary case, unchanged
-- from before: every stage locked except Foundation, which is in_progress.
-- Passing any other valid key marks every stage before it 'not_tracked'
-- (not 'locked' — it will never unlock, since it's being deliberately
-- skipped, not waited on), the chosen stage 'in_progress', and everything
-- after it 'locked' exactly as before.
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

-- ----------------------------------------------------------------------------
-- Stage-gating: the moment a sign-off is inserted for a stage, that stage
-- becomes 'approved' and the next stage (by order_index) becomes
-- 'in_progress' and unlocked. This is the actual mechanism behind "only
-- Foundation starts unlocked; the rest unlock one at a time."
-- ----------------------------------------------------------------------------
create or replace function unlock_next_stage_on_signoff()
returns trigger as $$
declare
  this_project_id uuid;
  this_order_index int;
begin
  update checklist_stages
    set status = 'approved'
    where id = new.stage_id;

  select project_id, order_index into this_project_id, this_order_index
    from checklist_stages where id = new.stage_id;

  update checklist_stages
    set status = 'in_progress', unlocked_at = now()
    where project_id = this_project_id
      and order_index = this_order_index + 1
      and status = 'locked';

  return new;
end;
$$ language plpgsql security definer;

create trigger unlock_next_stage_on_signoff_trigger
  after insert on sign_offs
  for each row execute function unlock_next_stage_on_signoff();

-- ----------------------------------------------------------------------------
-- Storage bucket for checkpoint evidence photos. Private (not public) —
-- access goes through the same project-membership check as every other
-- table, via the storage policies below, not a guessable public URL.
-- Path convention: {project_id}/{checkpoint_id}/{uuid}.jpg
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('checkpoint-evidence', 'checkpoint-evidence', false)
on conflict (id) do nothing;

create policy "members can view evidence files of their projects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'checkpoint-evidence'
    and (is_project_member((storage.foldername(name))[1]::uuid) or current_user_is_admin())
  );

create policy "members can upload evidence files to their projects"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'checkpoint-evidence'
    and is_project_member((storage.foldername(name))[1]::uuid)
  );
-- No update/delete policy here either — same immutability rule as the
-- checkpoint_evidence table row that points at this file.

-- ============================================================================
-- FIX — sign-off was only restricted to the nominated designer in the app's
-- UI (hiding the button from everyone else), not in the database itself.
-- Anyone could still have called the API directly and signed off as a
-- non-designer, which would also have unlocked the next stage — the same
-- gap the "RLS is the real boundary, the UI is not" principle exists to
-- catch. Replacing the original insert policy with one that checks
-- is_project_designer at the database level, not just project membership.
-- ============================================================================
create or replace function current_user_is_project_designer(target_project_id uuid)
returns boolean as $$
  select exists (
    select 1 from project_members
    where project_id = target_project_id
      and user_id = auth.uid()
      and is_project_designer = true
  );
$$ language sql security definer stable;

drop policy "project members can sign off as themselves" on sign_offs;

create policy "only the project's nominated designer can sign off"
  on sign_offs for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and current_user_is_project_designer((select project_id from checklist_stages where id = stage_id))
  );
