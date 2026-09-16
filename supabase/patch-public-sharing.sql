
-- ============================================================================
-- PUBLIC SHARE LINKS - shared infrastructure for "anyone with this link can
-- view this, no account needed." Used by both Trust Reports and Completed
-- Projects. The link table itself is never readable by anon directly - all
-- anonymous access goes through security-definer functions that check the
-- token first and return only what that specific token unlocks. Revoking
-- a link is just setting revoked_at; the function checks that on every call.
-- ============================================================================

create table public_share_links (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('trust_reports', 'completed_project_folder')),
  resource_id uuid not null,
  token text not null unique default replace(encode(gen_random_bytes(24), 'base64'), '/', '_'),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public_share_links enable row level security;

drop policy if exists "creator or admin can view their share links" on public_share_links;
drop policy if exists "authorized users can create share links" on public_share_links;
drop policy if exists "creator or admin can revoke share links" on public_share_links;

create policy "creator or admin can view their share links"
  on public_share_links for select
  to authenticated
  using (created_by = auth.uid() or current_user_is_admin());

-- The insert itself still checks real access to the underlying resource -
-- creating a link for a trust_reports project you're not a member of, or
-- a folder your firm doesn't own, is blocked here, not just at read time.
create policy "authorized users can create share links"
  on public_share_links for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      (resource_type = 'trust_reports' and is_project_member(resource_id))
      or (resource_type = 'completed_project_folder' and exists (
        select 1 from project_folders f where f.id = resource_id and f.firm_id = current_user_firm_id()
      ))
      or current_user_is_admin()
    )
  );

create policy "creator or admin can revoke share links"
  on public_share_links for update
  to authenticated
  using (created_by = auth.uid() or current_user_is_admin())
  with check (created_by = auth.uid() or current_user_is_admin());

create index if not exists idx_public_share_links_token on public_share_links (token);

-- ----------------------------------------------------------------------------
-- Trust Reports sharing: pure text/database data, so this can be fully
-- self-contained in SQL - no file access needed, so no new secret key
-- needed either. security definer means this function runs with elevated
-- privilege for its own internal lookup, same technique already used by
-- is_project_member() and every other helper function in this schema -
-- anon is granted execute on the function itself, never on the underlying
-- tables directly.
-- ----------------------------------------------------------------------------
create or replace function get_shared_trust_reports(share_token text)
returns table(project_name text, project_location text, report_text text, generated_at timestamptz) as $$
  select p.name, p.location, tr.report_text, tr.created_at
  from public_share_links psl
  join projects p on p.id = psl.resource_id
  join trust_reports tr on tr.project_id = psl.resource_id and tr.status = 'done'
  where psl.token = share_token
    and psl.resource_type = 'trust_reports'
    and psl.revoked_at is null
  order by tr.created_at desc;
$$ language sql security definer stable;

grant execute on function get_shared_trust_reports(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Completed Projects sharing: file metadata can be looked up the same way,
-- but the actual files still need a signed URL to view, which is a Storage
-- API operation, not something a SQL function can do - that part is
-- handled server-side in the app (see app/api/share/completed-project/
-- [token]/route.ts), using the service role key specifically because RLS
-- has no clean way to gate "a signed URL request carrying a token" the way
-- it can gate a plain table SELECT. This function only returns metadata
-- (names, categories) - never the actual file bytes or a working URL.
-- ----------------------------------------------------------------------------
create or replace function get_shared_completed_project_files(share_token text)
returns table(folder_name text, file_id uuid, file_name text, category text, file_type text, storage_path text) as $$
  select f.name, pff.id, pff.file_name, pff.category, pff.file_type, pff.storage_path
  from public_share_links psl
  join project_folders f on f.id = psl.resource_id
  join project_folder_files pff on pff.folder_id = psl.resource_id
  where psl.token = share_token
    and psl.resource_type = 'completed_project_folder'
    and psl.revoked_at is null
  order by pff.created_at;
$$ language sql security definer stable;

grant execute on function get_shared_completed_project_files(text) to anon, authenticated;
