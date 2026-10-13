-- ============================================================================
-- PATCH — Security review #5 (2026-10). Run once in the Supabase SQL Editor.
-- Already folded into schema.sql for a from-scratch build. Safe to re-run:
-- every statement is guarded, and nothing here can fail on pre-existing data
-- (size limits are NOT VALID so they only govern new writes).
--
-- Every fix below was proven against a real PostgreSQL instance loaded with
-- this project's actual schema, using live exploit attempts impersonating real
-- roles the way PostgREST does - not just code review.
--
-- IMPORTANT: deploy the matching app code (same commit) right after running
-- this. Section 3 hides vendor payout columns from customers, so the older
-- app version, which asked every user for those columns, would error until
-- the new code is live.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. PREREQUISITE GUARD - stop before changing anything if an earlier patch
-- is missing.
-- ----------------------------------------------------------------------------
do $$
declare missing_tables text; missing_funcs text;
begin
  select string_agg(t, ', ') into missing_tables
  from unnest(array['rcc_materials','finishing_materials','rcc_material_order_items','finishing_material_order_items',
                    'project_folders','project_folder_files','checkpoints','checklist_stages','sign_offs','vastu_assessments',
                    'vastu_chat_conversations','vastu_chat_messages','landscaping_selections','material_lists',
                    'quantity_calculations','quantity_doubt_messages','public_share_links','firm_invites','projects','profiles']) t
  where to_regclass('public.' || t) is null;

  select string_agg(f, ', ') into missing_funcs
  from unnest(array['enforce_daily_insert_cap()','enforce_immutable_columns()','current_user_is_admin()','is_project_member(uuid)',
                    'current_user_is_project_designer(uuid)','find_user_by_email(text)','get_shared_completed_project_files(text)']) f
  where to_regprocedure('public.' || f) is null;

  if missing_tables is not null or missing_funcs is not null then
    raise exception 'STOPPED BEFORE CHANGING ANYTHING - earlier patches are missing. Missing tables: %. Missing functions: %. Run patch-security-review-4.sql and the earlier feature patches first, then run this one again.',
      coalesce(missing_tables, 'none'), coalesce(missing_funcs, 'none');
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 1. SIGN-OFFS. The canonical schema dropped the original "any project member
-- can sign off" policy and its designer-only replacement was never created, so
-- the database itself had no sign-off rule at all (the app only hid the button
-- from non-designers). Re-create it, and add the checks the UI relied on but the
-- database never enforced: a stage can only be signed off while it is open, and
-- only after every checkpoint on it has been judged. Without this, a designer
-- calling the API directly could approve a LOCKED later stage and skip the
-- inspections in between.
-- ----------------------------------------------------------------------------
drop policy if exists "project members can sign off as themselves" on sign_offs;
drop policy if exists "only the project's designer can sign off" on sign_offs;

create policy "only the project's designer can sign off"
  on sign_offs for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and current_user_is_project_designer((select cs.project_id from checklist_stages cs where cs.id = stage_id))
  );

create or replace function enforce_signoff_preconditions()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare stage_state text;
begin
  select status::text into stage_state from checklist_stages where id = new.stage_id;
  if stage_state is null then
    raise exception 'This stage does not exist.';
  end if;
  if stage_state not in ('in_progress', 'submitted') then
    raise exception 'This stage is % and cannot be signed off right now.', stage_state;
  end if;
  if exists (select 1 from checkpoints where stage_id = new.stage_id and status = 'pending') then
    raise exception 'Every checkpoint on this stage must be judged before it can be signed off.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_signoff_preconditions_trigger on sign_offs;
create trigger enforce_signoff_preconditions_trigger
  before insert on sign_offs
  for each row execute function enforce_signoff_preconditions();

-- A checkpoint is part of the inspection record: only its pass/fail/flag status
-- may change, and not once its stage is signed off (or still locked).
create or replace function enforce_checkpoint_integrity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare stage_state text;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.stage_id is distinct from old.stage_id
     or new.description is distinct from old.description
     or new.standard_reference is distinct from old.standard_reference
     or new.order_index is distinct from old.order_index then
    raise exception 'Only a checkpoint''s status can be changed.';
  end if;
  if new.status is distinct from old.status then
    select status::text into stage_state from checklist_stages where id = old.stage_id;
    if stage_state in ('approved', 'locked', 'not_tracked') then
      raise exception 'This stage is %, so its checkpoints can no longer be changed.', stage_state;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_checkpoint_integrity_trigger on checkpoints;
create trigger enforce_checkpoint_integrity_trigger
  before update on checkpoints
  for each row execute function enforce_checkpoint_integrity();


-- ----------------------------------------------------------------------------
-- 2. fee_exempt could be switched ON by anyone at project creation (only
-- UPDATE was locked). Force it off on insert unless the actor is an admin.
-- ----------------------------------------------------------------------------
create or replace function lock_fee_exempt_on_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not current_user_is_admin() then
    new.fee_exempt := false;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_fee_exempt_on_insert_trigger on projects;
create trigger lock_fee_exempt_on_insert_trigger
  before insert on projects
  for each row execute function lock_fee_exempt_on_insert();


-- ----------------------------------------------------------------------------
-- 3. VENDOR PAYOUT CONFIDENTIALITY. What you pay vendors (your margin) was
-- readable by every logged-in user straight from the API, and the customer
-- order pages even sent it to the browser. Customers can no longer read the
-- payout columns at all; admins read them through a function that checks
-- admin-ness. Saving prices and placing orders is unchanged (the order-item
-- trigger fills the payout snapshot server-side).
-- NOTE: any column you add to these four tables later must be granted to
-- authenticated explicitly (grant select (new_col) on table to authenticated).
-- ----------------------------------------------------------------------------
do $$
declare t text; cols text;
begin
  foreach t in array array['rcc_materials','finishing_materials','rcc_material_order_items','finishing_material_order_items'] loop
    execute format('revoke select on public.%I from authenticated, anon', t);
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
    where table_schema = 'public' and table_name = t and column_name not in ('vendor_payout', 'unit_vendor_payout');
    execute format('grant select (%s) on public.%I to authenticated', cols, t);
  end loop;
end $$;

create or replace function admin_material_payouts(kind text)
returns table (id uuid, vendor_payout numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not current_user_is_admin() then
    raise exception 'Admins only.';
  end if;
  if kind = 'rcc' then
    return query select m.id, m.vendor_payout from rcc_materials m;
  elsif kind = 'finishing' then
    return query select m.id, m.vendor_payout from finishing_materials m;
  else
    raise exception 'Unknown catalog.';
  end if;
end;
$$;

revoke all on function admin_material_payouts(text) from public, anon;
grant execute on function admin_material_payouts(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 4. CROSS-TENANT FILE POINTER. A firm member could add a file record to their
-- own folder whose storage_path pointed into ANOTHER firm's folder; sharing
-- their folder publicly would then have signed a download link for the other
-- firm's file. Records must now point inside their own folder, and the public
-- share function ignores any record that doesn't.
-- ----------------------------------------------------------------------------
alter table project_folder_files drop constraint if exists project_folder_files_path_in_folder;
alter table project_folder_files
  add constraint project_folder_files_path_in_folder
  check (storage_path like folder_id::text || '/%' and storage_path not like '%/../%') not valid;

create or replace function get_shared_completed_project_files(share_token text)
returns table (folder_name text, file_id uuid, file_name text, category text, file_type text, storage_path text)
language sql stable security definer set search_path = public, pg_temp as $$
  select f.name, pff.id, pff.file_name, pff.category, pff.file_type, pff.storage_path
  from public_share_links psl
  join project_folders f on f.id = psl.resource_id
  join project_folder_files pff on pff.folder_id = psl.resource_id
  where psl.token = share_token
    and psl.resource_type = 'completed_project_folder'
    and psl.revoked_at is null
    and pff.storage_path like psl.resource_id::text || '/%'
    and pff.storage_path not like '%/../%'
  order by pff.created_at;
$$;

-- A folder's owner, firm and creation time are fixed at creation; its link to a
-- project must point at a project of the same firm (or one the actor belongs to).
drop trigger if exists immutable_columns_trigger on project_folders;
create trigger immutable_columns_trigger
  before update on project_folders
  for each row execute function enforce_immutable_columns('created_by', 'firm_id', 'created_at');

create or replace function validate_folder_link()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.linked_project_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.linked_project_id is not distinct from old.linked_project_id then
    return new;
  end if;
  if auth.uid() is null or current_user_is_admin() then
    return new;
  end if;
  if not exists (
    select 1 from projects p
    where p.id = new.linked_project_id
      and (p.firm_id = new.firm_id or is_project_member(p.id) or p.created_by = auth.uid())
  ) then
    raise exception 'A folder can only be linked to one of your own firm''s projects.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_folder_link_trigger on project_folders;
create trigger validate_folder_link_trigger
  before insert or update on project_folders
  for each row execute function validate_folder_link();


-- ----------------------------------------------------------------------------
-- 5. FIND-USER-BY-EMAIL ENUMERATION. Any logged-in user could look up unlimited
-- email addresses and learn whether each is registered, plus name, role and
-- licence status. Now capped per user per day (the legitimate use is adding a
-- teammate to a project, which needs a handful of lookups).
-- ----------------------------------------------------------------------------
create table if not exists email_lookup_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table email_lookup_log enable row level security;
revoke all on email_lookup_log from anon, authenticated;
create index if not exists idx_email_lookup_log_user_day on email_lookup_log (user_id, created_at);

create or replace function find_user_by_email(lookup_email text)
returns table (id uuid, full_name text, role user_role, license_verified boolean)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare caller uuid := auth.uid(); n int;
begin
  if caller is null then
    raise exception 'Not signed in.';
  end if;
  perform pg_advisory_xact_lock(hashtext(caller::text || ':email_lookup'));
  select count(*) into n from email_lookup_log where user_id = caller and created_at >= date_trunc('day', now());
  if n >= 30 then
    raise exception 'Daily lookup limit reached - please try again tomorrow.';
  end if;
  insert into email_lookup_log (user_id) values (caller);
  delete from email_lookup_log where created_at < now() - interval '7 days';

  return query
    select p.id, p.full_name, p.role, p.license_verified
    from profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) = lower(lookup_email)
    limit 1;
end;
$$;

revoke all on function find_user_by_email(text) from public, anon;
grant execute on function find_user_by_email(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 6. UNBOUNDED WRITES. Any signed-up user could insert megabytes per row and
-- hundreds of rows per day into these tables straight through the API (storage
-- cost / database bloat). Size limits are generous - well above anything the app
-- writes - and NOT VALID, so existing rows are never touched; daily row caps
-- reuse the same trigger as the HomeCare tables (admins exempt).
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select * from (values
    ('profiles',                  'sz_full_name',      'length(full_name) <= 120'),
    ('profiles',                  'sz_license_number', 'length(license_number) <= 60'),
    ('projects',                  'sz_name_location',  'length(name) <= 150 and length(location) <= 250'),
    ('firms',                     'sz_name',           'length(name) <= 150'),
    ('firm_invites',              'sz_email',          'length(invited_email) <= 254'),
    ('project_folders',           'sz_name',           'length(name) <= 150'),
    ('project_folder_files',      'sz_names',          'length(file_name) <= 255 and length(storage_path) <= 400'),
    ('vastu_assessments',         'sz_payload',        'octet_length(answers::text) <= 100000 and octet_length(report::text) <= 200000'),
    ('vastu_chat_messages',       'sz_content',        'length(content) <= 20000 and length(image_storage_path) <= 400'),
    ('landscaping_selections',    'sz_items',          'octet_length(items::text) <= 200000'),
    ('material_lists',            'sz_items',          'octet_length(items::text) <= 400000 and length(source_description) <= 5000 and length(source_storage_path) <= 400'),
    ('quantity_calculations',     'sz_payload',        'octet_length(inputs::text) <= 200000 and octet_length(outputs::text) <= 200000 and length(photo_storage_path) <= 400'),
    ('quantity_doubt_messages',   'sz_content',        'length(question) <= 4000 and length(answer) <= 20000 and length(stage_group_key) <= 100'),
    ('landscaping_quotations',    'sz_quote',          'length(quote_details) <= 10000'),
    ('material_list_quotations',  'sz_quote',          'length(quote_details) <= 10000'),
    ('checkpoint_evidence',       'sz_payload',        'octet_length(device_metadata::text) <= 10000 and length(storage_path) <= 400 and length(ai_precheck_note) <= 5000'),
    ('trust_reports',             'sz_report',         'length(report_text) <= 100000'),
    ('sign_offs',                 'sz_confirmation',   'length(confirmation_text) <= 2000')
  ) as v(tbl, cname, expr)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.cname);
      execute format('alter table public.%I add constraint %I check (%s) not valid', r.tbl, r.cname, r.expr);
    end if;
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('vastu_assessments',          30,  'user_id'),
    ('vastu_chat_conversations',   30,  'user_id'),
    ('projects',                   20,  'created_by'),
    ('project_folders',            30,  'created_by'),
    ('project_folder_files',       300, 'uploaded_by'),
    ('landscaping_selections',     30,  'created_by'),
    ('material_lists',             60,  'created_by'),
    ('quantity_calculations',      100, 'user_id'),
    ('material_list_quotations',   50,  'shop_owner_id'),
    ('landscaping_quotations',     50,  'vendor_id'),
    ('firm_invites',               30,  'invited_by'),
    ('landscaping_vendor_invites', 50,  'invited_by'),
    ('material_list_shop_invites', 50,  'invited_by')
  ) as v(tbl, cap, col)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('drop trigger if exists daily_cap_trigger on public.%I', r.tbl);
      execute format('create trigger daily_cap_trigger before insert on public.%I for each row execute function enforce_daily_insert_cap(%L, %L)', r.tbl, r.cap::text, r.col);
    end if;
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 7. FORGEABLE AI VERDICT. record_ai_precheck() was callable by any project
-- member with any text, so someone could plant a fake "AI says this photo
-- looks fine" note on evidence (the designer sees that note when judging).
-- The verdict is now written only by the server (service role), once per photo,
-- through a function no signed-in user can call.
-- ----------------------------------------------------------------------------
create or replace function record_ai_precheck_server(target_evidence_id uuid, new_status text, note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new_status not in ('done', 'failed') then
    raise exception 'Invalid status.';
  end if;
  update checkpoint_evidence
  set ai_precheck_status = new_status, ai_precheck_note = left(note, 1000)
  where id = target_evidence_id and ai_precheck_status = 'pending';
end;
$$;

revoke all on function record_ai_precheck_server(uuid, text, text) from public, anon, authenticated;
grant execute on function record_ai_precheck_server(uuid, text, text) to service_role;
revoke all on function record_ai_precheck(uuid, text, text) from public, anon, authenticated;
