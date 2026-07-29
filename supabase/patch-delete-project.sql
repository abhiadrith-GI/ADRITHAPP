-- ============================================================================
-- PATCH — delete project capability.
-- Run this once in the Supabase SQL Editor. Already folded into schema.sql
-- for a from-scratch build.
--
-- Only this project's creator can delete it — not the designer, not a
-- platform admin, deliberately narrower than every other authority in this
-- app. Blocked entirely, with no override for anyone, the instant any
-- stage on the project has been signed off. checklist_stages, checkpoints,
-- checkpoint_evidence, and project_members all cascade automatically on
-- the actual delete; sign_offs deliberately does not, which is exactly why
-- this checks for one explicitly first, with a clear message, rather than
-- letting that absence surface as a raw constraint error.
--
-- Tested against real Postgres with RLS genuinely enforced: an outsider is
-- blocked outright; the creator can delete a project with no sign-offs,
-- and every related row genuinely disappears; the same creator is blocked
-- the moment even one sign-off exists; and a platform admin has no
-- override in that case either - by design, not oversight.
--
-- Safe to run against a live database: adds one new capability, touches
-- no existing data.
-- ============================================================================

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

-- Patch complete.
