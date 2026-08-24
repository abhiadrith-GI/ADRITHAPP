-- ============================================================================
-- PATCH — Security audit fixes (2026-08), found during a full review
-- prompted by the Isometric View removal. Run this once in the Supabase
-- SQL Editor. Already folded into schema.sql for a from-scratch build.
-- Safe to run multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. material_analysis_attempts had no way to mark a reservation done or
-- release one that failed - every attempt permanently cost one of the
-- person's 20 daily slots the instant it was logged, even when the AI
-- call that followed failed for reasons that were never their fault (a
-- bad key, a network blip, an Anthropic-side error). The
-- isometric_generations table got this exact fix via its own dedicated
-- patch a while back; this table never did. Application code
-- (app/api/materials/analyze/route.ts) now marks the reservation 'done'
-- once the AI genuinely responds, or releases it if the call itself
-- never gets a response at all.
-- ----------------------------------------------------------------------------
alter table material_analysis_attempts add column if not exists status text not null default 'pending';
alter table material_analysis_attempts drop constraint if exists material_analysis_attempts_status_check;
alter table material_analysis_attempts add constraint material_analysis_attempts_status_check
  check (status in ('pending', 'done'));

-- Existing rows predate the status column and represent attempts that
-- already ran one way or another - marking them 'done' rather than
-- 'pending' so they can't retroactively be "released".
update material_analysis_attempts set status = 'done' where status = 'pending';

drop policy if exists "users can complete their own pending analysis attempt" on material_analysis_attempts;
create policy "users can complete their own pending analysis attempt"
  on material_analysis_attempts for update
  to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid());

drop policy if exists "users can release their own pending analysis attempt" on material_analysis_attempts;
create policy "users can release their own pending analysis attempt"
  on material_analysis_attempts for delete
  to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- ----------------------------------------------------------------------------
-- 2. No storage bucket had a file_size_limit set - every upload path
-- relied entirely on application code to reject an oversized file, and
-- two of the AI-calling routes (materials/analyze, vastu/chat) turned
-- out not to be doing that at all (fixed separately, in code - see
-- lib/validate-image-input.ts). This is the defense-in-depth layer
-- underneath that: even if a future upload path forgets the same check,
-- the bucket itself now refuses anything past 15MB.
-- ----------------------------------------------------------------------------
update storage.buckets set file_size_limit = 15728640
where id in ('checkpoint-evidence', 'material-list-files', 'quantity-calc-files', 'vastu-chat-files', 'project-folder-files');

-- Patch complete.
