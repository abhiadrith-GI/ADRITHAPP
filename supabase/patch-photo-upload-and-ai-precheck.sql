-- ============================================================================
-- PATCH — gallery photo upload, 2-photo-per-checkpoint limit, AI precheck.
-- Run this once in the Supabase SQL Editor. Already folded into schema.sql
-- for a from-scratch build.
--
-- What this adds:
--   - Two new columns on checkpoint_evidence: ai_precheck_status and
--     ai_precheck_note. Every existing photo gets ai_precheck_status =
--     'pending' by default - nothing retroactive runs against old photos,
--     this only applies going forward.
--   - A hard limit of 2 photos per checkpoint, enforced here, not just
--     hidden in the app's screens.
--   - record_ai_precheck: the one narrow, function-enforced way
--     checkpoint_evidence can ever be updated after upload - it can only
--     ever touch the two ai_precheck_* columns, nothing else, by
--     construction. Everything that made evidence permanent before
--     (storage_path, uploaded_by, uploaded_at) still can never change.
--
-- The actual AI call itself lives in application code (a server route),
-- not in the database - this patch only adds where its result gets
-- stored and who's allowed to store it. The AI check is advisory only:
-- it never blocks or overrides Pass/Fail/Flag, which stays entirely the
-- project's designer's call, exactly as already built.
--
-- Tested against real Postgres with RLS genuinely enforced: two photos
-- succeed, a third on the same checkpoint is rejected with a clear
-- message, the precheck-recording function correctly updates only what
-- it should, and a non-project-member is correctly blocked from calling it.
--
-- Safe to run against a live database: adds columns and one new
-- capability, touches no existing data.
-- ============================================================================

alter table checkpoint_evidence add column if not exists ai_precheck_status text not null default 'pending';
alter table checkpoint_evidence add column if not exists ai_precheck_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'checkpoint_evidence_ai_precheck_status_check') then
    alter table checkpoint_evidence add constraint checkpoint_evidence_ai_precheck_status_check
      check (ai_precheck_status in ('pending', 'done', 'failed'));
  end if;
end
$$;

create or replace function enforce_evidence_limit()
returns trigger as $$
declare
  existing_count int;
begin
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

-- Patch complete.
