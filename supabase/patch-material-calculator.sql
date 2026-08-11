-- ============================================================================
-- PATCH — Plumbing & Electrical Material Calculator (Tool 4)
-- Never actually applied to the live database - this is the batch given
-- earlier that was set aside ("I will do that shortly") and then never
-- run. Confirmed missing via a direct read-only check before writing
-- this. Now also corrected in schema.sql to match - this file is the
-- one to actually run against your live database.
--
-- Investigating why this never went through turned up two real,
-- independent bugs in the original SQL:
--
-- 1) An ordering bug: the "invited shop owners can view lists shared
--    with them" policy on material_lists referenced
--    material_list_shop_invites before that table existed yet in
--    statement order. CREATE POLICY validates table references at
--    creation time, so this fails immediately on a fresh run - almost
--    certainly the actual reason the batch failed when it was finally
--    attempted. Fixed by moving material_list_shop_invites's table
--    creation earlier; its own policies stay where they were, since
--    those only need the material_lists TABLE (not any particular
--    policy on it) to exist.
--
-- 2) A genuine circular RLS reference, only found by testing against
--    real data rather than re-reading the SQL: that same "invited shop
--    owners" policy reads material_list_shop_invites, whose own
--    "project members can view invites on their lists" policy reads
--    back into material_lists - a real mutual reference Postgres
--    correctly refuses to evaluate ("infinite recursion detected in
--    policy for relation material_lists"). Fixed with a small
--    security-definer helper function, is_invited_shop_owner_for_list()
--    - the same technique is_project_member() already uses everywhere
--    else in this schema to safely cross an RLS boundary without
--    triggering the other table's own policies.
--
-- Retested end to end after both fixes: DDL loads clean standalone, and
-- a full functional lifecycle (create draft, finalize, invite a shop
-- owner, submit a quotation, confirm an unrelated user and an uninvited
-- shop owner see neither, confirm the finalized-list lock still holds,
-- confirm the 20/day analysis rate limit still triggers) passes against
-- real rows, not just empty tables - the recursion specifically only
-- surfaces once real data makes the policies actually evaluate against
-- each other.
--
-- Safe to run once. All statements are idempotent (if not exists /
-- drop-then-create policy), so it's also safe to run again if needed.
-- ============================================================================
create table if not exists material_lists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  created_by uuid not null references profiles (id),
  trade text not null check (trade in ('plumbing', 'electrical')),
  room_type text not null,
  -- Full room-by-room material breakdown as structured JSON - see
  -- lib/materials/types.ts for the real shape. Replaced wholesale on
  -- each edit while in draft, same pattern as other structured-data
  -- tables in this platform (vastu_assessments, quantity_calculations).
  items jsonb not null default '[]'::jsonb,
  -- What the AI actually saw, kept for reference even after finalizing.
  source_type text check (source_type in ('photo', 'plan', 'description')),
  source_storage_path text,
  source_description text,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  finalized_by uuid references profiles (id),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table material_lists enable row level security;

-- Moved up from later in the original section - has to exist before the
-- "invited shop owners can view lists shared with them" policy below,
-- which references it. See header note.
create table if not exists material_list_shop_invites (
  id uuid primary key default gen_random_uuid(),
  material_list_id uuid not null references material_lists (id) on delete cascade,
  shop_owner_id uuid not null references profiles (id),
  invited_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  unique (material_list_id, shop_owner_id)
);

alter table material_list_shop_invites enable row level security;

-- Breaks a real circular RLS reference: this policy needs to check
-- material_list_shop_invites, whose own "project members can view
-- invites" policy reads back into material_lists - a genuine mutual
-- reference Postgres correctly refuses to evaluate ("infinite recursion
-- detected in policy for relation material_lists"), caught only by
-- actually running a real query against real data, not by reading the
-- SQL. A security-definer helper (same trick is_project_member() already
-- uses everywhere else in this schema) bypasses RLS on the table it
-- reads internally, which is exactly what breaks the cycle.
create or replace function is_invited_shop_owner_for_list(target_list_id uuid)
returns boolean as $$
  select exists (
    select 1 from material_list_shop_invites
    where material_list_id = target_list_id and shop_owner_id = auth.uid()
  );
$$ language sql security definer stable;

drop policy if exists "project members can view their project's material lists" on material_lists;
drop policy if exists "invited shop owners can view lists shared with them" on material_lists;
drop policy if exists "project members can create material lists" on material_lists;
drop policy if exists "creator can update their own draft material list" on material_lists;

create policy "project members can view their project's material lists"
  on material_lists for select
  to authenticated
  using (is_project_member(project_id) or current_user_is_admin());

create policy "invited shop owners can view lists shared with them"
  on material_lists for select
  to authenticated
  using (is_invited_shop_owner_for_list(id));

create policy "project members can create material lists"
  on material_lists for insert
  to authenticated
  with check (created_by = auth.uid() and is_project_member(project_id));

create policy "creator can update their own draft material list"
  on material_lists for update
  to authenticated
  using (created_by = auth.uid() and is_project_member(project_id))
  with check (created_by = auth.uid());

-- The real lock enforcement - a finalized list cannot be edited again by
-- anyone, including its own creator, regardless of what the UI shows.
-- Only the specific draft->finalized transition is allowed through.
create or replace function enforce_material_list_lock()
returns trigger as $$
begin
  if old.status = 'finalized' then
    raise exception 'This material list is finalized and permanently locked. Create a new list for any change.';
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists enforce_material_list_lock_trigger on material_lists;
create trigger enforce_material_list_lock_trigger
  before update on material_lists
  for each row execute function enforce_material_list_lock();

-- ----------------------------------------------------------------------------
-- Shop invites - the list creator explicitly shares a FINALIZED list with
-- a specific shop owner, found the same way a project member is found -
-- by their real ADRITH account email, reusing find_user_by_email rather
-- than inventing a second lookup mechanism. (Table itself was moved up
-- above material_lists's policies - just its own policies live here.)
-- ----------------------------------------------------------------------------
drop policy if exists "project members can view invites on their lists" on material_list_shop_invites;
drop policy if exists "shop owners can view their own invites" on material_list_shop_invites;
drop policy if exists "list creator can invite shop owners to a finalized list" on material_list_shop_invites;

create policy "project members can view invites on their lists"
  on material_list_shop_invites for select
  to authenticated
  using (
    exists (
      select 1 from material_lists ml
      where ml.id = material_list_id and is_project_member(ml.project_id)
    )
  );

create policy "shop owners can view their own invites"
  on material_list_shop_invites for select
  to authenticated
  using (shop_owner_id = auth.uid());

create policy "list creator can invite shop owners to a finalized list"
  on material_list_shop_invites for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and exists (
      select 1 from material_lists ml
      where ml.id = material_list_id and ml.created_by = auth.uid() and ml.status = 'finalized'
    )
  );

-- ----------------------------------------------------------------------------
-- Quotations - a shop owner's own real quote against a list. Immutable
-- once submitted, same principle as sign_offs and checkpoint_evidence - a
-- real record of what was quoted and when, not something edited in
-- place. A revised quote is a new row, not an edit to the old one.
-- ----------------------------------------------------------------------------
create table if not exists material_list_quotations (
  id uuid primary key default gen_random_uuid(),
  material_list_id uuid not null references material_lists (id) on delete cascade,
  shop_owner_id uuid not null references profiles (id),
  quote_details text not null,
  created_at timestamptz not null default now()
);

alter table material_list_quotations enable row level security;

drop policy if exists "project members can view quotations on their lists" on material_list_quotations;
drop policy if exists "a shop owner can view their own submitted quotations" on material_list_quotations;
drop policy if exists "invited shop owners can submit a quotation" on material_list_quotations;

create policy "project members can view quotations on their lists"
  on material_list_quotations for select
  to authenticated
  using (
    exists (
      select 1 from material_lists ml
      where ml.id = material_list_id and is_project_member(ml.project_id)
    )
  );

create policy "a shop owner can view their own submitted quotations"
  on material_list_quotations for select
  to authenticated
  using (shop_owner_id = auth.uid());

create policy "invited shop owners can submit a quotation"
  on material_list_quotations for insert
  to authenticated
  with check (
    shop_owner_id = auth.uid()
    and is_invited_shop_owner_for_list(material_list_id)
  );

-- ----------------------------------------------------------------------------
-- Storage for source photos/plans, scoped by project like quantity-calc-files.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('material-list-files', 'material-list-files', false)
on conflict (id) do nothing;

drop policy if exists "members can view their project's material list files" on storage.objects;
drop policy if exists "members can upload material list files for their projects" on storage.objects;

create policy "members can view their project's material list files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'material-list-files'
    and (is_project_member((storage.foldername(name))[1]::uuid) or current_user_is_admin())
  );

create policy "members can upload material list files for their projects"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'material-list-files'
    and is_project_member((storage.foldername(name))[1]::uuid)
  );

-- ----------------------------------------------------------------------------
-- Rate limit on AI analysis calls - same advisory-locked pattern already
-- proven for isometric_generations and Ask Vastu. Tracks analysis
-- attempts (including clarifying-question round-trips), not finished
-- lists, since each round-trip is its own AI call and its own real cost.
-- ----------------------------------------------------------------------------
create table if not exists material_analysis_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

alter table material_analysis_attempts enable row level security;

drop policy if exists "users can view their own analysis attempts" on material_analysis_attempts;
drop policy if exists "users can log their own analysis attempts" on material_analysis_attempts;

create policy "users can view their own analysis attempts"
  on material_analysis_attempts for select
  to authenticated
  using (user_id = auth.uid() or current_user_is_admin());

create policy "users can log their own analysis attempts"
  on material_analysis_attempts for insert
  to authenticated
  with check (user_id = auth.uid());

create or replace function enforce_material_analysis_limit()
returns trigger as $$
declare
  todays_count int;
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':material_analysis'));

  select count(*) into todays_count
  from material_analysis_attempts
  where user_id = new.user_id
    and created_at >= date_trunc('day', now());

  if todays_count >= 20 then
    raise exception 'Daily material analysis limit (20) already reached for today';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_material_analysis_limit_trigger on material_analysis_attempts;
create trigger enforce_material_analysis_limit_trigger
  before insert on material_analysis_attempts
  for each row execute function enforce_material_analysis_limit();
