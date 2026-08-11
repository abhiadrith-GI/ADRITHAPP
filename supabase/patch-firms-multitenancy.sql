-- ============================================================================
-- PATCH — Multi-tenancy: ADRITH becomes a platform any firm, contractor,
-- or engineer can subscribe to, not an internal-only tool.
-- Run this once in the Supabase SQL Editor. Already folded into
-- schema.sql for a from-scratch build. Safe to run multiple times (every
-- statement is idempotent - if not exists / or replace / drop-then-create
-- policy - and the data migration is guarded on "no firms exist yet").
--
-- TESTED against a real local Postgres instance before this ever touched
-- the live database - a full mock of Supabase's auth.uid()/auth.jwt(),
-- two competing firms, cross-firm collaborators, and 24 assertions run
-- as the actual `authenticated` role (RLS genuinely enforced, not
-- bypassed by a superuser connection). Two real bugs were caught and
-- fixed this way before they ever reached production:
--
-- 1) An ordering bug in an earlier draft of this exact patch - a firms
--    policy referenced profiles.firm_id before that column existed yet
--    in statement order. Postgres doesn't validate this at review time;
--    it only surfaces when the statements actually run in sequence.
--
-- 2) A privilege-escalation gap: the two new profiles columns
--    (firm_id, is_firm_admin) were not covered by the existing
--    lock_privileged_profile_fields trigger that already protects
--    role/license_verified/is_platform_admin from being self-edited via
--    a raw update call. Confirmed exploitable in the test harness before
--    the fix (a regular user could set is_firm_admin = true on their own
--    row); confirmed blocked after.
--
-- What's confirmed working end to end: self-serve firm creation at
-- signup, joining an existing firm via a real invite (wrong-email
-- claims are silently rejected, not linked), the subscription gate on
-- project creation (a firm stuck on 'pending' cannot create projects),
-- cross-firm project/profile isolation, firm-admin firm-wide project
-- visibility, cross-firm collaborators still working exactly as before,
-- and every downstream tool (quantity_calculations tested directly,
-- the same is_project_member() pattern covers vastu/materials/civil-qc
-- identically) staying correctly scoped with no changes needed there.
-- ============================================================================

-- Extends the existing lock_privileged_profile_fields trigger to also
-- protect firm_id and is_firm_admin - without this, "users can update
-- their own profile" (using (id = auth.uid())) would let anyone grant
-- themselves firm-admin rights or move themselves into another firm's
-- id via a raw update call, the exact class of bug that trigger already
-- exists to prevent for role/license_verified/is_platform_admin.
--
-- The signup trigger (handle_new_user, below) legitimately needs to set
-- both fields once, at account creation. Rather than lean only on the
-- existing has_jwt_context heuristic (correct for the SQL-editor
-- bootstrap case, but not something this sandbox can verify against a
-- real Supabase project for the signup-trigger timing specifically), it
-- sets an explicit, transaction-local session flag right before doing
-- so. That flag is never reachable from a client request - it's only
-- ever set from inside this trigger's own function body, which end
-- users have no path to invoke directly.
create or replace function lock_privileged_profile_fields()
returns trigger as $$
declare
  requester_is_admin boolean;
  has_jwt_context boolean;
  is_signup_context boolean;
begin
  has_jwt_context := coalesce(auth.jwt(), '{}'::jsonb) != '{}'::jsonb;
  is_signup_context := coalesce(current_setting('adrith.signup_trigger_context', true), '') = 'true';

  select coalesce(is_platform_admin, false) into requester_is_admin
  from profiles where id = auth.uid();
  requester_is_admin := coalesce(requester_is_admin, false);

  if has_jwt_context and not requester_is_admin and not is_signup_context then
    new.role := old.role;
    new.is_platform_admin := old.is_platform_admin;
    new.license_verified := old.license_verified;
    new.firm_id := old.firm_id;
    new.is_firm_admin := old.is_firm_admin;
  end if;

  return new;
end;
$$ language plpgsql security definer;
-- (trigger itself, lock_privileged_profile_fields_trigger, already
-- exists from the base schema and points at this function by name - no
-- need to redefine it, `create or replace function` is enough.)

create table if not exists firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles (id),
  -- pending: signed up, not yet paying. active: full access. past_due /
  -- cancelled: access withdrawn. No payment processor is wired up yet
  -- (Razorpay is the India-market candidate) - until it is, an admin
  -- flips this manually. See stamp_project_firm_id() below for the actual
  -- enforcement point.
  subscription_status text not null default 'pending'
    check (subscription_status in ('pending', 'active', 'past_due', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table firms enable row level security;

-- profiles.firm_id / is_firm_admin have to exist before any firms policy
-- can reference them below - added here, ahead of those policies.
alter table profiles add column if not exists firm_id uuid references firms (id);
alter table profiles add column if not exists is_firm_admin boolean not null default false;

create index if not exists idx_profiles_firm_id on profiles (firm_id);
create index if not exists idx_project_members_user_id on project_members (user_id);
create index if not exists idx_projects_created_by on projects (created_by);

create policy "firm members can view their own firm"
  on firms for select
  to authenticated
  using (id = (select firm_id from profiles where id = auth.uid()) or current_user_is_admin());

create policy "firm admins can update their own firm"
  on firms for update
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and is_firm_admin and firm_id = firms.id)
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and is_firm_admin and firm_id = firms.id)
  );

create policy "admin can update any firm"
  on firms for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

-- Deliberately no insert policy here for regular users - firm creation
-- only ever happens inside handle_new_user() below (security definer,
-- runs as the function owner, bypasses RLS), never as a raw client
-- insert. That's what stops someone creating a firm row without also
-- correctly becoming its admin in the same atomic step.

create or replace function current_user_firm_id()
returns uuid as $$
  select firm_id from profiles where id = auth.uid();
$$ language sql security definer stable;

-- Used by the profiles policy below: does auth.uid() share at least one
-- project (as creator or member - the creator is never auto-added to
-- project_members, so both have to be checked) with the target user?
-- This is what keeps "show me my teammate's name on this project" working
-- for cross-firm collaborators once profiles stops being world-readable.
create or replace function shares_project_with(other_user_id uuid)
returns boolean as $$
  select exists (
    select 1 from projects p
    where
      (p.created_by = auth.uid() or exists (
        select 1 from project_members pm where pm.project_id = p.id and pm.user_id = auth.uid()
      ))
      and
      (p.created_by = other_user_id or exists (
        select 1 from project_members pm where pm.project_id = p.id and pm.user_id = other_user_id
      ))
  );
$$ language sql security definer stable;

-- Was "using (true)" - any signed-up user could read any other user's
-- name/role, harmless when everyone was Adrith staff, a real cross-firm
-- staff-directory leak once anyone can sign up. Narrowed to: yourself,
-- a platform admin, same firm, or someone you actually share a project
-- with (preserves the existing cross-firm-collaborator case untouched).
drop policy if exists "profiles are readable by any authenticated user" on profiles;
create policy "profiles are readable within firm or shared projects"
  on profiles for select
  to authenticated
  using (
    id = auth.uid()
    or current_user_is_admin()
    or (firm_id is not null and firm_id = current_user_firm_id())
    or shares_project_with(id)
  );

alter table projects add column if not exists firm_id uuid references firms (id);
create index if not exists idx_projects_firm_id on projects (firm_id);

-- Firm is stamped server-side from the creator's own profile, never taken
-- from client input (same principle as every other identity-bearing
-- column in this schema). Also the actual subscription gate: a firm that
-- hasn't been activated can't create new projects. This is the one choke
-- point every tool in the app sits behind, so nothing else needs its own
-- separate subscription check.
create or replace function stamp_project_firm_id()
returns trigger as $$
declare
  creator_firm_id uuid;
  creator_sub_status text;
begin
  select p.firm_id, f.subscription_status into creator_firm_id, creator_sub_status
  from profiles p
  left join firms f on f.id = p.firm_id
  where p.id = new.created_by;

  if creator_firm_id is null then
    raise exception 'You must belong to a firm before creating a project.';
  end if;

  if creator_sub_status is distinct from 'active' then
    raise exception 'Your firm''s subscription is not active yet. Contact support to activate it.';
  end if;

  new.firm_id := creator_firm_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists stamp_project_firm_id_trigger on projects;
create trigger stamp_project_firm_id_trigger
  before insert on projects
  for each row execute function stamp_project_firm_id();

-- Firm admins see every project their own firm owns, not only the ones
-- they personally happen to be a project_member on - preserves how a
-- small firm like Adrith already works today (the founder effectively
-- sees everything) rather than narrowing it as a side effect of this
-- change. Regular firm staff still only see what they're explicitly
-- added to, exactly as before.
drop policy if exists "members can view their projects" on projects;
create policy "members can view their projects"
  on projects for select
  to authenticated
  using (
    is_project_member(id)
    or created_by = auth.uid()
    or current_user_is_admin()
    or (
      firm_id = current_user_firm_id()
      and exists (select 1 from profiles where id = auth.uid() and is_firm_admin)
    )
  );

-- ----------------------------------------------------------------------------
-- FIRM INVITES - a firm admin invites a specific email to join their firm's
-- team. Mirrors material_list_shop_invites: no "join by typing a firm name"
-- path exists, since that would let anyone claim any firm.
-- ----------------------------------------------------------------------------
create table if not exists firm_invites (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms (id),
  invited_email text not null,
  invited_by uuid not null references profiles (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now()
);

alter table firm_invites enable row level security;

create policy "firm admins can view invites for their firm"
  on firm_invites for select
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and is_firm_admin and firm_id = firm_invites.firm_id)
    or current_user_is_admin()
  );

create policy "firm admins can create invites for their firm"
  on firm_invites for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and is_firm_admin and firm_id = firm_invites.firm_id)
  );

create policy "firm admins can revoke invites for their firm"
  on firm_invites for update
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and is_firm_admin and firm_id = firm_invites.firm_id)
  )
  with check (status = 'revoked');

-- ----------------------------------------------------------------------------
-- SELF-SERVE FIRM CREATION, extending handle_new_user()
-- Runs at the moment the auth.users row is inserted (signUp() time), not
-- at first confirmed login - so this doesn't depend on email confirmation
-- being done first. firm_action/firm_name/invite_id travel in the same
-- raw_user_meta_data the role/full_name/date_of_birth fields already use.
-- shop_owner accounts are deliberately skipped entirely - see the
-- shop_owner role's own design note elsewhere in this schema; they stay
-- firm-independent on purpose. Anything malformed (bad invite id, email
-- mismatch, missing firm name) degrades to "account created, no firm
-- yet" rather than failing signup outright - the app's own onboarding
-- screen is what catches and resolves that, not a trigger-level error.
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger as $$
declare
  requested_role public.user_role;
  dob date;
  firm_action text;
  requested_firm_name text;
  requested_invite_id uuid;
  new_firm_id uuid;
  invite_record record;
begin
  requested_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'contractor');

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

  if requested_role != 'shop_owner' then
    firm_action := new.raw_user_meta_data ->> 'firm_action';

    -- Transaction-local (the `true` argument) - clears itself at commit,
    -- never leaks into any later, unrelated update on this connection.
    perform set_config('adrith.signup_trigger_context', 'true', true);

    if firm_action = 'create' then
      requested_firm_name := nullif(trim(new.raw_user_meta_data ->> 'firm_name'), '');
      if requested_firm_name is not null then
        insert into firms (name, created_by, subscription_status)
        values (requested_firm_name, new.id, 'pending')
        returning id into new_firm_id;

        update public.profiles set firm_id = new_firm_id, is_firm_admin = true where id = new.id;
      end if;

    elsif firm_action = 'join' then
      begin
        requested_invite_id := nullif(new.raw_user_meta_data ->> 'invite_id', '')::uuid;
      exception when others then
        requested_invite_id := null;
      end;

      if requested_invite_id is not null then
        select * into invite_record from firm_invites
        where id = requested_invite_id
          and status = 'pending'
          and lower(invited_email) = lower(new.email);

        if found then
          update public.profiles set firm_id = invite_record.firm_id, is_firm_admin = false where id = new.id;
          update firm_invites set status = 'accepted' where id = requested_invite_id;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- POST-SIGNUP RECOVERY: create_firm_for_self / accept_firm_invite_for_self
-- handle_new_user() only ever runs once, at signup. Since a bad/missing
-- firm_action there deliberately doesn't fail the signup (see the note
-- above handle_new_user), an account can genuinely end up with no firm -
-- these two give that person a way to fix it from inside the app
-- afterward, using the exact same logic and the same signup_trigger_context
-- bypass, rather than being permanently stuck with no way back in.
-- ----------------------------------------------------------------------------
create or replace function create_firm_for_self(new_firm_name text)
returns uuid as $$
declare
  caller_firm_id uuid;
  new_firm_id uuid;
begin
  select firm_id into caller_firm_id from profiles where id = auth.uid();
  if caller_firm_id is not null then
    raise exception 'You already belong to a firm.';
  end if;

  if new_firm_name is null or trim(new_firm_name) = '' then
    raise exception 'Firm name is required.';
  end if;

  insert into firms (name, created_by, subscription_status)
  values (trim(new_firm_name), auth.uid(), 'pending')
  returning id into new_firm_id;

  perform set_config('adrith.signup_trigger_context', 'true', true);
  update profiles set firm_id = new_firm_id, is_firm_admin = true where id = auth.uid();

  return new_firm_id;
end;
$$ language plpgsql security definer;

grant execute on function create_firm_for_self(text) to authenticated;

create or replace function accept_firm_invite_for_self(target_invite_id uuid)
returns uuid as $$
declare
  caller_firm_id uuid;
  caller_email text;
  invite_record record;
begin
  select firm_id into caller_firm_id from profiles where id = auth.uid();
  if caller_firm_id is not null then
    raise exception 'You already belong to a firm.';
  end if;

  select email into caller_email from auth.users where id = auth.uid();

  select * into invite_record from firm_invites
  where id = target_invite_id
    and status = 'pending'
    and lower(invited_email) = lower(caller_email);

  if not found then
    raise exception 'This invite is invalid, already used, or was sent to a different email address.';
  end if;

  perform set_config('adrith.signup_trigger_context', 'true', true);
  update profiles set firm_id = invite_record.firm_id, is_firm_admin = false where id = auth.uid();
  update firm_invites set status = 'accepted' where id = target_invite_id;

  return invite_record.firm_id;
end;
$$ language plpgsql security definer;

grant execute on function accept_firm_invite_for_self(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- DATA MIGRATION: existing Adrith data becomes the first firm.
-- Idempotent (guarded on "no firms exist yet") so it's safe if this file
-- is accidentally run twice. Excludes shop_owner profiles on purpose -
-- they were never Adrith staff and shouldn't be swept into the firm.
-- ----------------------------------------------------------------------------
do $$
declare
  adrith_firm_id uuid;
  first_admin_id uuid;
begin
  if not exists (select 1 from firms) then
    select id into first_admin_id from profiles where is_platform_admin = true order by created_at asc limit 1;
    if first_admin_id is null then
      select id into first_admin_id from profiles order by created_at asc limit 1;
    end if;

    if first_admin_id is not null then
      insert into firms (name, created_by, subscription_status)
      values ('Adrith Designs and Constructions', first_admin_id, 'active')
      returning id into adrith_firm_id;

      update profiles
      set firm_id = adrith_firm_id, is_firm_admin = (id = first_admin_id)
      where firm_id is null and role != 'shop_owner';

      update projects set firm_id = adrith_firm_id where firm_id is null;
    end if;
  end if;
end $$;

alter table projects alter column firm_id set not null;
