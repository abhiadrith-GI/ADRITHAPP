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
create type user_role as enum ('owner', 'contractor', 'engineer', 'architect', 'student');

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
  has_jwt_context boolean;
begin
  -- Direct database access (the Supabase SQL Editor, or any other direct
  -- connection) never carries a JWT at all - no request.jwt.claims, no
  -- auth.uid(). That's deliberately the one path allowed to grant these
  -- fields, since it's exactly how the very first admin has to be
  -- bootstrapped - nothing in the app itself can grant admin status, by
  -- design (see make-me-admin.sql). A request arriving WITH a JWT is a
  -- real, authenticated app user; for that path, only an existing admin
  -- can change these fields, never a regular user granting themselves
  -- anything.
  --
  -- coalesce()'d on both checks below so a missing/null value is treated
  -- as "not admin" / "no JWT" (fail closed) rather than silently passing
  -- through via SQL's three-valued NULL logic (fail open). An earlier
  -- version of this function coalesced the service-role check but not
  -- this one - which is exactly why, when run from the SQL Editor,
  -- license_verified and role were slipping through unprotected while
  -- is_platform_admin stayed correctly blocked: requester_is_admin came
  -- back NULL (auth.uid() matches no row outside a real session), and
  -- "if not NULL" silently skips the whole block instead of enforcing it.
  has_jwt_context := coalesce(auth.jwt(), '{}'::jsonb) != '{}'::jsonb;

  select coalesce(is_platform_admin, false) into requester_is_admin
  from profiles where id = auth.uid();
  requester_is_admin := coalesce(requester_is_admin, false);

  if has_jwt_context and not requester_is_admin then
    new.role := old.role;
    new.is_platform_admin := old.is_platform_admin;
    new.license_verified := old.license_verified;
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
--
-- BUG FIX: previously cast to plain `user_role`, unqualified. That type has
-- always lived in `public` and always existed - the problem was never that
-- it was missing, only that this function's search_path (set by whichever
-- internal connection invokes it) didn't necessarily include `public`,
-- so Postgres couldn't find it: "type user_role does not exist". This is
-- exactly why every real signup attempt failed with a 500. Explicitly
-- qualifying the type, and pinning the function's own search_path so this
-- can't recur for the same reason again, fixes it for good rather than by
-- coincidence of whatever connection happens to invoke it.
create or replace function handle_new_user()
returns trigger as $$
declare
  requested_role public.user_role;
  dob date;
begin
  requested_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'contractor');

  -- Student accounts require confirming 18+ - enforced here, not just as
  -- a UI hint, since under-18 data processing has real, specific legal
  -- requirements (verifiable parental consent) this app isn't built to
  -- handle. A malformed or missing date of birth is treated the same as
  -- failing the check, not as passing it by default. Compares actual
  -- calendar dates rather than intervals deliberately - Postgres compares
  -- intervals using an approximate 360-day year, which doesn't reliably
  -- match real calendar math right at the 18-year boundary.
  if requested_role = 'student' then
    dob := (new.raw_user_meta_data ->> 'date_of_birth')::date;
    if dob is null or dob > (current_date - interval '18 years')::date then
      raise exception 'Student accounts require confirming you are 18 or older.';
    end if;
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    requested_role
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

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
  -- Null = Foundation (happens once, whole building). 0 = Ground Floor,
  -- 1 = 1st Floor, 2 = 2nd Floor, and so on — each added on demand via
  -- add_next_floor as construction actually reaches that point, not all
  -- pre-created upfront.
  floor_number int,
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

-- Checkpoint status updates (Pass/Fail/Flag) are restricted to this
-- project's nominated designer only — see the actual policy for this much
-- further down, right after current_user_is_project_designer is defined
-- (that function doesn't exist yet at this point in the file). Photo
-- evidence (checkpoint_evidence, above) is a completely separate table
-- and stays open to every project member, untouched.

-- ----------------------------------------------------------------------------
-- 5. CHECKPOINT EVIDENCE  (photos — insert-only, never editable)
-- ----------------------------------------------------------------------------
create table checkpoint_evidence (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references checkpoints (id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid not null references profiles (id),
  uploaded_at timestamptz not null default now(),
  device_metadata jsonb,
  -- Set asynchronously, after upload, via record_ai_precheck below - never
  -- part of the initial insert. 'pending' until the AI call actually
  -- returns (or fails); the photo itself is already permanent by then
  -- regardless of what happens with this.
  ai_precheck_status text not null default 'pending' check (ai_precheck_status in ('pending', 'done', 'failed')),
  ai_precheck_note text
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
-- Deliberately no general UPDATE or DELETE policy on this table — the
-- fields that make evidence trustworthy (storage_path, uploaded_by,
-- uploaded_at) can never be changed by anyone, at any time, through any
-- path. record_ai_precheck below is the one narrow exception: it can
-- only ever touch the two ai_precheck_* columns, hardcoded in the
-- function body itself, not something a caller can redirect.

-- At most 2 photos per checkpoint - enforced here, not just hidden in the
-- UI once a checkpoint already has two.
create or replace function enforce_evidence_limit()
returns trigger as $$
declare
  existing_count int;
begin
  -- Advisory lock scoped to this one checkpoint, held until the
  -- transaction ends. Closes a real race: without this, two uploads
  -- landing within the same instant could each see "only 1 photo exists"
  -- before either commits, letting 3 through instead of the intended 2.
  -- Different checkpoints use different lock keys, so this only
  -- serializes uploads competing for the *same* checkpoint, nothing else.
  perform pg_advisory_xact_lock(hashtext(new.checkpoint_id::text));

  select count(*) into existing_count
  from checkpoint_evidence where checkpoint_id = new.checkpoint_id;

  if existing_count >= 2 then
    raise exception 'This checkpoint already has 2 photos, the limit per checkpoint.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_evidence_limit_trigger on checkpoint_evidence;

create trigger enforce_evidence_limit_trigger
  before insert on checkpoint_evidence
  for each row execute function enforce_evidence_limit();

-- Called by the server after an AI precheck actually completes (or fails)
-- for a specific photo. Only ever writes ai_precheck_status/ai_precheck_note
-- - every other column is untouchable through this path, by construction,
-- not by convention. This is advisory only: it informs the engineer's
-- judgment, it never blocks or overrides Pass/Fail/Flag, which stays
-- entirely the designer's call either way.
create or replace function record_ai_precheck(
  target_evidence_id uuid,
  new_status text,
  note text
)
returns void as $$
declare
  target_project_id uuid;
begin
  select cs.project_id into target_project_id
  from checkpoint_evidence ce
  join checkpoints cp on cp.id = ce.checkpoint_id
  join checklist_stages cs on cs.id = cp.stage_id
  where ce.id = target_evidence_id;

  if not (is_project_member(target_project_id) or current_user_is_admin()) then
    raise exception 'Not a member of this project.';
  end if;

  update checkpoint_evidence
  set ai_precheck_status = new_status, ai_precheck_note = note
  where id = target_evidence_id;
end;
$$ language plpgsql security definer;

grant execute on function record_ai_precheck(uuid, text, text) to authenticated;

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

-- ----------------------------------------------------------------------------
-- ISOMETRIC VIEW TOOL
-- Two bases: "top_view" (Actual Top View - exact, vector-PDF-only
-- reproduction) and "furniture_layout" (AI-suggested furniture
-- arrangement from a PDF, room photo, or 3D plan photo). Open to any
-- logged-in user - no role restriction, unlike Civil & RCC.
-- ----------------------------------------------------------------------------
create table if not exists isometric_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id),
  base text not null check (base in ('top_view', 'furniture_layout')),
  input_storage_path text not null,
  output_storage_path text,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'failed', 'rejected_not_vector')),
  rejection_reason text,
  created_at timestamptz not null default now()
);

alter table isometric_generations enable row level security;

drop policy if exists "users can view their own generations" on isometric_generations;
drop policy if exists "users can insert their own generations" on isometric_generations;
drop policy if exists "users can complete their own pending generation" on isometric_generations;

create policy "users can view their own generations"
  on isometric_generations for select
  to authenticated
  using (user_id = auth.uid() or current_user_is_admin());

create policy "users can insert their own generations"
  on isometric_generations for insert
  to authenticated
  with check (user_id = auth.uid());

-- Required for the reservation flow: the study step inserts a pending
-- row immediately (reserving a real slot before the AI call), and the
-- final save step updates that same row to done. Restricted to a user's
-- own row, and only while it's still pending - once a generation is
-- done, this policy no longer matches it, so it can't be edited again.
create policy "users can complete their own pending generation"
  on isometric_generations for update
  to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid());

-- Rejected (not-a-genuine-vector-PDF) attempts don't count against the
-- daily limit - only real, processed generations do. A person mistakenly
-- uploading a scan shouldn't lose one of their 5 for that alone. Takes
-- which base to check, since Top View and Furniture Layout each track
-- their own separate 5-per-day allowance, not a shared one.
create or replace function isometric_generations_remaining_today(target_user_id uuid, target_base text)
returns int as $$
  select greatest(0, 5 - count(*)::int)
  from isometric_generations
  where user_id = target_user_id
    and base = target_base
    and status != 'rejected_not_vector'
    and created_at >= date_trunc('day', now());
$$ language sql security definer stable;

grant execute on function isometric_generations_remaining_today(uuid, text) to authenticated;

-- SECURITY FIX: the insert policy only ever checked user_id = auth.uid()
-- - nothing stopped a direct API call from inserting far more than 5 rows
-- a day, completely bypassing the client UI's disabled-button limit.
-- Confirmed exploitable directly: 10 rows inserted in a single statement
-- before this fix. Advisory-locked per (user_id, base) - the same
-- pattern already proven necessary for the checkpoint-evidence 2-photo
-- limit - so two simultaneous requests can't both slip past the count
-- check before either commits.
create or replace function enforce_isometric_generation_limit()
returns trigger as $$
declare
  todays_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.base, 0));

  select count(*) into todays_count
  from isometric_generations
  where user_id = new.user_id
    and base = new.base
    and status != 'rejected_not_vector'
    and created_at >= date_trunc('day', now());

  if todays_count >= 5 then
    raise exception 'Daily generation limit (5) already reached for this tool today';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_isometric_generation_limit_trigger on isometric_generations;
create trigger enforce_isometric_generation_limit_trigger
  before insert on isometric_generations
  for each row execute function enforce_isometric_generation_limit();

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

-- Being nominated as a project's designer now requires two things together:
-- the right role (engineer/architect) AND license_verified = true on that
-- person's own account. Enforced here, not just in the app's screens —
-- since any project's creator can add anyone as anything, nothing stops a
-- client from sending is_project_designer=true for someone who shouldn't
-- have it, unless the database itself checks. Silently corrects back to
-- false rather than raising an error, same pattern as
-- lock_privileged_profile_fields below. Granting license_verified itself
-- is still an admin-only action either way (see that trigger) — this just
-- makes sure the designer flag can never be true without it.
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

-- Lets a project start tracking from any of the six stages, not only
-- Foundation — for a firm joining mid-construction (e.g. the slab is
-- already poured). Null/'foundation' is the ordinary default start, no
-- request involved. Requesting any other stage needs confirmation from
-- this project's nominated designer or a platform admin before the
-- checklist_stages rows actually get created — see finalize_project_setup
-- and approve_project_start_stage further below.
alter table projects add column requested_start_stage_key text;
alter table projects add column start_stage_pending boolean not null default false;
-- How many floors already exist above Ground when a project starts
-- mid-construction (0 = just Ground Floor, the ordinary default for a
-- brand-new build). Only read once, at initial seeding — further floors
-- beyond this are added later via add_next_floor as construction reaches
-- them, not by changing this number after the fact.
alter table projects add column requested_floor_count int not null default 0;

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
-- Stage + checkpoint templates. Two parts now, not one fixed list:
--   1. Foundation — happens once, whole building, seeded at project creation.
--   2. A per-floor template — the same five stages repeat for every floor
--      (Ground, 1st, 2nd, ...), each floor's stages only created once
--      construction actually reaches that floor (see add_next_floor below),
--      except however many floors already exist when a project starts
--      mid-construction (see initial_floor_count in the seeding function).
--
-- Checkpoints are written in plain language first (what the contractor
-- actually reads), with the IS-code reference as secondary/supporting
-- detail for the reviewing engineer — never the other way round. Every
-- checkpoint tests an outcome (is it correct?), never a method (how was it
-- done?) — a manually-marked layout passes exactly the same as an
-- instrument-marked one, provided the result is right.
--
-- This structure — and every checkpoint in it — came directly from the
-- architect using this platform, stage by stage, confirmed back to them
-- and corrected where they said so, not written from general research.
-- ----------------------------------------------------------------------------
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

-- Only this project's creator can delete it — not the designer, not an
-- admin, deliberately, per the explicit decision that this authority
-- stays narrower than everything else in the app. Blocked entirely, with
-- no override, the moment any stage on the project has been signed off —
-- that's the line between "clean up something that shouldn't exist" and
-- "erase a confirmed record," and it's not negotiable once crossed.
-- checklist_stages, checkpoints, checkpoint_evidence, and project_members
-- all cascade automatically on the actual delete below; sign_offs
-- deliberately does not (see its table definition), which is exactly why
-- this check has to happen first, explicitly, with a clear message,
-- rather than letting that absence surface as a raw constraint error.
create or replace function delete_project(target_project_id uuid)
returns void as $$
declare
  is_creator boolean;
  has_signoffs boolean;
begin
  select (created_by = auth.uid()) into is_creator
  from projects where id = target_project_id;

  if not coalesce(is_creator, false) then
    raise exception 'Only this project''s creator can delete it.';
  end if;

  select exists(
    select 1 from sign_offs so
    join checklist_stages cs on cs.id = so.stage_id
    where cs.project_id = target_project_id
  ) into has_signoffs;

  if has_signoffs then
    raise exception 'This project has at least one signed-off stage and can no longer be deleted — once work is confirmed, the record is permanent.';
  end if;

  delete from projects where id = target_project_id;
end;
$$ language plpgsql security definer;

grant execute on function delete_project(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Performance indexes.
-- project_members(project_id, user_id) and checklist_stages(project_id,
-- stage_key) already have an index each, as a side effect of their unique
-- constraints above - genuinely nothing more needed there. These three
-- don't have that side effect, since nothing about them is unique, and
-- every one of them gets queried constantly (every stage's checkpoints,
-- every checkpoint's evidence, every sign-off check) - worth adding
-- explicitly now, before real usage at scale makes the gap felt, rather
-- than after.
-- ----------------------------------------------------------------------------
create index if not exists idx_checkpoints_stage_id on checkpoints (stage_id);
create index if not exists idx_checkpoint_evidence_checkpoint_id on checkpoint_evidence (checkpoint_id);
create index if not exists idx_sign_offs_stage_id on sign_offs (stage_id);

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

-- ----------------------------------------------------------------------------
-- Storage bucket for the Isometric View tool. Private, scoped per-user
-- (not per-project - this tool isn't tied to any specific project).
-- Path convention: {user_id}/{generation_id}/input.pdf and .../output.jpg
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('isometric-files', 'isometric-files', false)
on conflict (id) do nothing;

drop policy if exists "users can view their own isometric files" on storage.objects;
drop policy if exists "users can upload their own isometric files" on storage.objects;

create policy "users can view their own isometric files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'isometric-files'
    and ((storage.foldername(name))[1]::uuid = auth.uid() or current_user_is_admin())
  );

create policy "users can upload their own isometric files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'isometric-files'
    and (storage.foldername(name))[1]::uuid = auth.uid()
  );

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

-- Same authority as sign-off, extended to day-to-day checkpoint status too
-- (Pass/Fail/Flag) — reflecting the later decision that only this
-- project's nominated designer finalizes anything, not just the final
-- stage sign-off. Everyone else on the project can still attach photos
-- freely (checkpoint_evidence, a separate table, untouched by this).
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
