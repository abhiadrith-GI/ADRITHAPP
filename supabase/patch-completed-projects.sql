-- ============================================================================
-- PATCH — Completed Projects: firm-internal cloud storage for drawings and
-- site photos, organized as folders (usually per-project, any name is
-- fine) each containing two sections. Replaces an earlier design built
-- around a platform-wide public showcase - confirmed directly that this
-- is internal storage instead, a genuinely different thing, not a
-- variation of that.
--
-- Hierarchy, confirmed directly: one folder per project, Drawings and
-- Site Photos as two sections inside each folder - not the other way
-- around.
--
-- Firm-internal only, confirmed directly - unlike the showcase design
-- this replaces, there is no platform-wide visibility here at all. Any
-- firm member can create folders and upload, confirmed directly - this
-- is shared team storage, not restricted to designer roles the way
-- upload authority works in the rest of this app.
--
-- No finalize/lock concept here, unlike material_lists or the showcase
-- design this replaces - "cloud storage" implies ongoing, editable
-- storage (add a revised drawing, add more site photos as work
-- progresses), not a curate-once-then-permanent-lock model. Any firm
-- member can also delete, matching how a shared team drive normally
-- works - this is an assumption, not something explicitly confirmed,
-- worth flagging plainly rather than guessing silently.
--
-- Checked for the same circular-RLS-reference class of bug already
-- caught once in this schema (material_lists / material_list_shop_invites):
-- project_folder_files' policies read project_folders, but
-- project_folders' own policies never read files back, so there's no
-- cycle here.
-- ============================================================================
create table if not exists project_folders (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms (id),
  created_by uuid not null references profiles (id),
  name text not null,
  -- Optional, and deliberately so - "any type of folders" means a folder
  -- never has to correspond to a project actually tracked stage-by-stage
  -- in this app.
  linked_project_id uuid references projects (id),
  created_at timestamptz not null default now()
);

alter table project_folders enable row level security;

drop policy if exists "firm members can view their own firm's folders" on project_folders;
drop policy if exists "firm members can create folders for their own firm" on project_folders;
drop policy if exists "firm members can delete their own firm's folders" on project_folders;
drop policy if exists "firm members can rename their own firm's folders" on project_folders;

create policy "firm members can view their own firm's folders"
  on project_folders for select
  to authenticated
  using (firm_id = current_user_firm_id() or current_user_is_admin());

create policy "firm members can create folders for their own firm"
  on project_folders for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "firm members can delete their own firm's folders"
  on project_folders for delete
  to authenticated
  using (firm_id = current_user_firm_id() or current_user_is_admin());

create policy "firm members can rename their own firm's folders"
  on project_folders for update
  to authenticated
  using (firm_id = current_user_firm_id())
  with check (firm_id = current_user_firm_id());

-- Same "never trust the client for identity-bearing fields" principle
-- used everywhere else - firm_id is stamped from the creator's own
-- profile, not taken from client input, and gated on the same
-- active-subscription requirement every other creation path enforces.
create or replace function stamp_folder_firm_id()
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
    raise exception 'You must belong to a firm to create a folder.';
  end if;

  if creator_sub_status is distinct from 'active' then
    raise exception 'Your firm''s subscription is not active yet.';
  end if;

  new.firm_id := creator_firm_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists stamp_folder_firm_id_trigger on project_folders;
create trigger stamp_folder_firm_id_trigger
  before insert on project_folders
  for each row execute function stamp_folder_firm_id();

-- ----------------------------------------------------------------------------
-- Files - drawings (pdf, and images of a drawing) and site photos
-- (images), distinguished by category. One table, not two, since access
-- rules are identical for both categories.
-- ----------------------------------------------------------------------------
create table if not exists project_folder_files (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references project_folders (id) on delete cascade,
  uploaded_by uuid not null references profiles (id),
  category text not null check (category in ('drawing', 'site_photo')),
  file_name text not null,
  storage_path text not null,
  file_type text not null check (file_type in ('pdf', 'image')),
  created_at timestamptz not null default now()
);

alter table project_folder_files enable row level security;

drop policy if exists "firm members can view files in their own firm's folders" on project_folder_files;
drop policy if exists "firm members can upload files to their own firm's folders" on project_folder_files;
drop policy if exists "firm members can delete files from their own firm's folders" on project_folder_files;

create policy "firm members can view files in their own firm's folders"
  on project_folder_files for select
  to authenticated
  using (
    exists (
      select 1 from project_folders f
      where f.id = folder_id and (f.firm_id = current_user_firm_id() or current_user_is_admin())
    )
  );

create policy "firm members can upload files to their own firm's folders"
  on project_folder_files for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from project_folders f where f.id = folder_id and f.firm_id = current_user_firm_id()
    )
  );

create policy "firm members can delete files from their own firm's folders"
  on project_folder_files for delete
  to authenticated
  using (
    exists (
      select 1 from project_folders f where f.id = folder_id and f.firm_id = current_user_firm_id()
    )
  );

create index if not exists idx_project_folder_files_folder_id on project_folder_files (folder_id);
create index if not exists idx_project_folders_firm_id on project_folders (firm_id);

-- ----------------------------------------------------------------------------
-- Storage
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('project-folder-files', 'project-folder-files', false)
on conflict (id) do nothing;

drop policy if exists "firm members can view their own firm's stored files" on storage.objects;
drop policy if exists "firm members can upload to their own firm's folders" on storage.objects;
drop policy if exists "firm members can delete their own firm's stored files" on storage.objects;

create policy "firm members can view their own firm's stored files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-folder-files'
    and exists (
      select 1 from project_folders f
      where f.id = (storage.foldername(storage.objects.name))[1]::uuid
        and (f.firm_id = current_user_firm_id() or current_user_is_admin())
    )
  );

create policy "firm members can upload to their own firm's folders"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-folder-files'
    and exists (
      select 1 from project_folders f
      where f.id = (storage.foldername(storage.objects.name))[1]::uuid and f.firm_id = current_user_firm_id()
    )
  );

create policy "firm members can delete their own firm's stored files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-folder-files'
    and exists (
      select 1 from project_folders f
      where f.id = (storage.foldername(storage.objects.name))[1]::uuid and f.firm_id = current_user_firm_id()
    )
  );
