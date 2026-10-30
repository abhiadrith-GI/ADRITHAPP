-- ============================================================================
-- PATCH — Security review #6 (2026-10). Run once in the Supabase SQL Editor.
-- Already folded into schema.sql for a from-scratch build. Safe to re-run.
-- Proven against a real PostgreSQL instance loaded with this project's schema,
-- using live exploit attempts that impersonate real roles.
-- ============================================================================

do $$
begin
  if to_regprocedure('public.admin_material_payouts(text)') is null
     or to_regprocedure('public.enforce_signoff_preconditions()') is null then
    raise exception 'STOPPED BEFORE CHANGING ANYTHING - run patch-security-review-5.sql first, then run this file again.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Signed-in users hold TRUNCATE / TRIGGER / REFERENCES on every table.
-- Row-level security does NOT govern TRUNCATE, so on any path that could run raw
-- SQL a user could empty a whole table. The app never needs these rights, so
-- remove them now and for every table created later.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
  end loop;
end $$;

alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Evidence photos could be added to a stage AFTER it was signed off (or while
-- it was still locked), quietly padding the inspection record. Photos are only
-- accepted while the stage is open.
-- ----------------------------------------------------------------------------
create or replace function enforce_evidence_stage_open()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare stage_state text;
begin
  select cs.status::text into stage_state
  from checkpoints cp join checklist_stages cs on cs.id = cp.stage_id
  where cp.id = new.checkpoint_id;
  if stage_state in ('approved', 'locked', 'not_tracked') then
    raise exception 'This stage is %, so new photos can no longer be added to it.', stage_state;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_evidence_stage_open_trigger on checkpoint_evidence;
create trigger enforce_evidence_stage_open_trigger
  before insert on checkpoint_evidence
  for each row execute function enforce_evidence_stage_open();
