-- ============================================================================
-- PATCH — Student role, a real concurrency-race fix, and performance indexes.
-- Run this once in the Supabase SQL Editor. Already folded into schema.sql
-- for a from-scratch build. Safe to run regardless of whether earlier
-- patches (photo-upload, delete-project) have been applied yet - nothing
-- here depends on them.
--
-- What this adds:
--   1. A new 'student' role. On the Civil & RCC tool specifically, a
--      Student gets exactly the same tier as a Contractor - can view real
--      projects and attach photos, no authority to judge or sign off.
--      This needed zero new permission logic: the existing designer-only
--      check already gates purely on the is_project_designer flag, not on
--      which role someone picked, so a Student is automatically
--      restricted the same way the moment the role exists at all.
--   2. A real concurrency fix for the 2-photos-per-checkpoint limit. Under
--      the original version, two uploads landing at nearly the same
--      instant could both slip past the count check before either
--      committed, letting 3 photos through instead of 2. Fixed with an
--      advisory lock scoped to the specific checkpoint being uploaded to.
--      Verified with an actual concurrent test (two real simultaneous
--      insert attempts, not just sequential testing) - one was correctly
--      rejected, the final count came out to exactly 2.
--   3. Three indexes on columns that get queried constantly (a stage's
--      checkpoints, a checkpoint's evidence, a stage's sign-off) but
--      didn't have one yet, since nothing about them is naturally unique.
--      Added now, before real usage at scale makes the gap felt.
--
-- Safe to run against a live database: no existing data is touched.
-- ============================================================================

alter type user_role add value if not exists 'student';

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

create index if not exists idx_checkpoints_stage_id on checkpoints (stage_id);
create index if not exists idx_checkpoint_evidence_checkpoint_id on checkpoint_evidence (checkpoint_id);
create index if not exists idx_sign_offs_stage_id on sign_offs (stage_id);



-- Real, database-enforced 18+ requirement for student signups - not just
-- a UI hint. Verified against the exact boundary: a signup one day short
-- of 18 is correctly rejected, exactly-18 is correctly allowed, and a
-- missing date of birth fails the check rather than defaulting to open.
-- Also fixes a real bug in an earlier draft of this same check: comparing
-- actual calendar dates rather than intervals, since Postgres compares
-- intervals using an approximate 360-day year that doesn't reliably match
-- real calendar math right at the 18-year boundary.
drop trigger if exists on_auth_user_created on auth.users;

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

-- Patch complete.
