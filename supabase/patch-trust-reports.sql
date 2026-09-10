
-- ============================================================================
-- NRI TRUST REPORTS - a new top-level tool. Reads existing project data
-- (checklist_stages, checkpoints, checkpoint_evidence - all already built
-- for Civil & RCC) and has Claude generate a clear, honest, client-facing
-- progress narrative from it. No new construction-tracking data is
-- created here - this is purely a translation/reporting layer on top of
-- what Civil & RCC already records.
--
-- Deliberately on-demand for v1, not an automated weekly schedule - that
-- needs background job infrastructure (a real, separate undertaking).
-- Any project member can generate a report for their own project, not
-- just the admin - the whole point is a client (an NRI or anyone else)
-- checking in on their own schedule, not waiting for Abhinandan to send
-- one.
-- ============================================================================

create table trust_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  generated_by uuid not null references profiles (id),
  status text not null default 'pending' check (status in ('pending', 'done')),
  report_text text,
  created_at timestamptz not null default now()
);

alter table trust_reports enable row level security;

drop policy if exists "project members can view trust reports" on trust_reports;
drop policy if exists "project members can generate trust reports" on trust_reports;

create policy "project members can view trust reports"
  on trust_reports for select
  to authenticated
  using (is_project_member(project_id) or current_user_is_admin());

create policy "project members can generate trust reports"
  on trust_reports for insert
  to authenticated
  with check (generated_by = auth.uid() and is_project_member(project_id) and status = 'pending' and report_text is null);

drop policy if exists "generating user can complete or release their own pending report" on trust_reports;
create policy "generating user can complete or release their own pending report"
  on trust_reports for update
  to authenticated
  using (generated_by = auth.uid() and status = 'pending')
  with check (generated_by = auth.uid());

drop policy if exists "generating user can release their own pending report" on trust_reports;
create policy "generating user can release their own pending report"
  on trust_reports for delete
  to authenticated
  using (generated_by = auth.uid() and status = 'pending');

create index if not exists idx_trust_reports_project_id on trust_reports (project_id);

-- ----------------------------------------------------------------------------
-- Rate limit: same advisory-locked pattern already proven for Ask Vastu
-- and the material-analysis routes. Scoped per project, not per user -
-- multiple project members generating reports for the SAME project
-- should share one daily limit, since they're all asking about the same
-- underlying construction data, which doesn't change meaningfully more
-- than once a day anyway.
-- ----------------------------------------------------------------------------
create or replace function enforce_trust_report_limit()
returns trigger as $$
declare
  todays_count int;
begin
  perform pg_advisory_xact_lock(hashtext(new.project_id::text || ':trust_report'));

  select count(*) into todays_count
  from trust_reports
  where project_id = new.project_id
    and created_at >= date_trunc('day', now());

  if todays_count >= 2 then
    raise exception 'A trust report was already generated for this project today - construction status will not have changed enough for another one yet';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_trust_report_limit_trigger on trust_reports;
create trigger enforce_trust_report_limit_trigger
  before insert on trust_reports
  for each row execute function enforce_trust_report_limit();
