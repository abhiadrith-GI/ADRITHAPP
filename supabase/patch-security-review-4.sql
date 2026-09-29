-- ============================================================================
-- PATCH — Security review #4 (2026-09). Run once in the Supabase SQL Editor.
-- Already folded into schema.sql for a from-scratch build. Safe to re-run:
-- every statement is guarded, and nothing here can fail on pre-existing
-- data (duplicates are cleaned first; size limits are NOT VALID so they
-- only govern new writes).
--
-- Every fix below was proven against a real PostgreSQL instance loaded with
-- this project's actual schema, using live exploit attempts impersonating
-- real roles the way PostgREST does - not just code review.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. PREREQUISITE GUARD. This patch builds on tables and functions from earlier
-- patches (public sharing, trust reports, HomeCare, Design Studio). If any is
-- missing from the live database, stop HERE - before a single change is made -
-- with a message that says exactly what to run first, instead of failing halfway
-- with "function does not exist".
-- ----------------------------------------------------------------------------
do $$
declare missing_tables text; missing_funcs text;
begin
  select string_agg(t, ', ') into missing_tables
  from unnest(array['rcc_material_orders','rcc_material_order_items','finishing_material_orders','finishing_material_order_items',
                    'finished_house_service_requests','design_studio_bookings','trust_reports','public_share_links',
                    'material_analysis_attempts','firms']) t
  where to_regclass('public.' || t) is null;

  select string_agg(f, ', ') into missing_funcs
  from unnest(array['get_shared_trust_reports(text)','get_shared_completed_project_files(text)',
                    'create_default_stages_and_checkpoints(uuid,text,integer)','current_user_is_admin()','is_project_member(uuid)']) f
  where to_regprocedure('public.' || f) is null;

  if missing_tables is not null or missing_funcs is not null then
    raise exception 'STOPPED BEFORE CHANGING ANYTHING - earlier patches are missing. Missing tables: %. Missing functions: %. Run those earlier patch files first (most likely patch-public-sharing.sql and patch-trust-reports.sql), then run this one again.',
      coalesce(missing_tables, 'none'), coalesce(missing_funcs, 'none');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. ANONYMOUS ACCESS TO SECURITY DEFINER FUNCTIONS.
-- Postgres grants EXECUTE on every new function to PUBLIC by default, and
-- Supabase also grants it to anon - so every SECURITY DEFINER function (which
-- runs with the owner's privileges, bypassing RLS by design) was callable by
-- an anonymous visitor through the REST API. Confirmed by exploit: an
-- anonymous visitor could look up any person's name/role/license status by
-- email (find_user_by_email), and could create checklist stages inside
-- someone else's project (finalize_project_setup - see #4).
-- Fix: revoke from PUBLIC and anon on every non-trigger definer function,
-- keep signed-in access, then grant anon back ONLY the two share-link
-- functions that exist to serve logged-out viewers.
-- (Trigger functions are left alone: they cannot be called through the API,
-- and auth-signup triggers run as a different internal role.)
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

grant execute on function get_shared_trust_reports(text) to anon;
grant execute on function get_shared_completed_project_files(text) to anon;

-- Internal helper only - the app never calls it directly (only other
-- definer functions do, and those run as the owner, so they keep working).
revoke execute on function create_default_stages_and_checkpoints(uuid, text, integer) from authenticated;

-- Future functions shouldn't be anonymously callable by default either.
alter default privileges in schema public revoke execute on functions from public, anon;

-- ----------------------------------------------------------------------------
-- 2. ANONYMOUS ACCESS TO TABLES. RLS was the only gate; a single policy
-- accidentally written without "to authenticated" would have applied to
-- anon too. Nothing anonymous-reachable queries tables directly (login,
-- signup, password reset use the Auth API; share pages use the two
-- functions above), so anon gets no table privileges at all - a second,
-- independent wall behind RLS.
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ----------------------------------------------------------------------------
-- 3. search_path PINNING. A SECURITY DEFINER function without a fixed
-- search_path resolves unqualified names through the CALLER's search path,
-- the classic definer-hijack pattern (and Supabase's own linter warning:
-- 32 of 33 functions had none). Pinned dynamically, so this also covers any
-- definer function added in future patches that forgot to set one.
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 4. finalize_project_setup HAD NO AUTHORIZATION CHECK. Confirmed by exploit:
-- an anonymous visitor and an unrelated signed-in stranger each called it on
-- another user's project and it created 12 checklist stages inside it (and
-- for projects with a pending start stage it could flip start_stage_pending).
-- Now: caller must be a member of the project, its creator, or a platform
-- admin. The project-creation flow (creator right after creating) still works.
-- ----------------------------------------------------------------------------
create or replace function finalize_project_setup(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_key text;
  requested_floors int;
begin
  if auth.uid() is null or not (
       is_project_member(target_project_id)
       or current_user_is_admin()
       or exists (select 1 from projects where id = target_project_id and created_by = auth.uid())
     ) then
    raise exception 'Only a member of this project can finish setting it up.';
  end if;

  select requested_start_stage_key, requested_floor_count
    into requested_key, requested_floors
  from projects where id = target_project_id;

  if requested_key is null or requested_key = 'layout' then
    perform create_default_stages_and_checkpoints(target_project_id, 'layout', coalesce(requested_floors, 0));
    return;
  end if;

  if current_user_is_project_designer(target_project_id) or current_user_is_admin() then
    perform create_default_stages_and_checkpoints(target_project_id, requested_key, coalesce(requested_floors, 0));
  else
    update projects set start_stage_pending = true where id = target_project_id;
  end if;
end;
$$;

grant execute on function finalize_project_setup(uuid) to authenticated, service_role;
revoke execute on function finalize_project_setup(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- 5. PRICE / FIELD TAMPERING ON APPROVAL. The customer-approval UPDATE
-- policies restrict which rows and which resulting STATUS - but RLS cannot
-- restrict which COLUMNS change. Confirmed by exploit: a customer approving a
-- ₹5,000 service quote rewrote it to ₹1 and wrote their own "discount
-- approved by owner" admin note; on material orders a customer changed the
-- delivery address, forged an admin note, and set paid_at during approval.
-- Now a customer (any signed-in non-admin) may change the status column and
-- nothing else. Admin, service role and SQL-editor edits are unaffected.
-- Compares whole rows minus status, so any column added later is protected
-- automatically.
-- ----------------------------------------------------------------------------
create or replace function enforce_customer_status_only_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not current_user_is_admin() then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'Only the status can be changed here - prices, addresses, notes and dates are set by the Adrith team';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_customer_status_only_trigger on rcc_material_orders;
create trigger enforce_customer_status_only_trigger
  before update on rcc_material_orders
  for each row execute function enforce_customer_status_only_update();

drop trigger if exists enforce_customer_status_only_trigger on finishing_material_orders;
create trigger enforce_customer_status_only_trigger
  before update on finishing_material_orders
  for each row execute function enforce_customer_status_only_update();

drop trigger if exists enforce_customer_status_only_trigger on finished_house_service_requests;
create trigger enforce_customer_status_only_trigger
  before update on finished_house_service_requests
  for each row execute function enforce_customer_status_only_update();

-- ----------------------------------------------------------------------------
-- 6. DUPLICATE LINE ITEMS. Nothing stopped one order carrying thousands of
-- copies of the same material row (confirmed by exploit). One row per
-- material per order; any pre-existing duplicates are removed first (keeping
-- the earliest) so this can't fail on old data.
-- ----------------------------------------------------------------------------
delete from rcc_material_order_items a using rcc_material_order_items b
  where a.order_id = b.order_id and a.material_id = b.material_id and a.ctid > b.ctid;
create unique index if not exists uq_rcc_order_items_order_material
  on rcc_material_order_items (order_id, material_id);

delete from finishing_material_order_items a using finishing_material_order_items b
  where a.order_id = b.order_id and a.material_id = b.material_id and a.ctid > b.ctid;
create unique index if not exists uq_finishing_order_items_order_material
  on finishing_material_order_items (order_id, material_id);

-- ----------------------------------------------------------------------------
-- 7. ADMIN-INBOX SPAM. Any registered user could file unlimited orders,
-- requests and bookings straight into the admin's inbox (confirmed: 200 orders
-- in one call). Daily caps per user, same advisory-locked pattern as every
-- other rate limit here. Platform admin and service-role/SQL-editor writes
-- are exempt. Generous for real use: a person placing 15 material orders in
-- a day is not a customer, it's a script.
-- ----------------------------------------------------------------------------
create or replace function enforce_daily_insert_cap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  cap int := tg_argv[0]::int;
  col text := tg_argv[1];
  who uuid;
  n int;
begin
  if auth.uid() is null or current_user_is_admin() then
    return new;
  end if;
  who := (to_jsonb(new) ->> col)::uuid;
  perform pg_advisory_xact_lock(hashtext(who::text || ':cap:' || tg_table_name));
  execute format('select count(*) from %I where %I = $1 and created_at >= date_trunc(''day'', now())', tg_table_name, col)
    into n using who;
  if n >= cap then
    raise exception 'Daily limit reached (% per day) - please try again tomorrow', cap;
  end if;
  return new;
end;
$$;

drop trigger if exists daily_cap_trigger on rcc_material_orders;
create trigger daily_cap_trigger before insert on rcc_material_orders
  for each row execute function enforce_daily_insert_cap(15, user_id);
drop trigger if exists daily_cap_trigger on finishing_material_orders;
create trigger daily_cap_trigger before insert on finishing_material_orders
  for each row execute function enforce_daily_insert_cap(15, user_id);
drop trigger if exists daily_cap_trigger on finished_house_service_requests;
create trigger daily_cap_trigger before insert on finished_house_service_requests
  for each row execute function enforce_daily_insert_cap(10, user_id);
drop trigger if exists daily_cap_trigger on design_studio_bookings;
create trigger daily_cap_trigger before insert on design_studio_bookings
  for each row execute function enforce_daily_insert_cap(10, user_id);
drop trigger if exists daily_cap_trigger on public_share_links;
create trigger daily_cap_trigger before insert on public_share_links
  for each row execute function enforce_daily_insert_cap(20, created_by);

-- ----------------------------------------------------------------------------
-- 8. UNBOUNDED TEXT. A signed-in user could store multi-megabyte text in
-- any free-text field straight through the API (confirmed: a 6MB request
-- description) - a cheap way to exhaust a small database. NOT VALID means
-- these govern every new and updated row but can never break the patch over
-- old data.
-- ----------------------------------------------------------------------------
alter table rcc_material_orders drop constraint if exists rcc_orders_text_limits;
alter table rcc_material_orders add constraint rcc_orders_text_limits
  check (char_length(project_name) <= 200 and char_length(delivery_address) <= 1000 and char_length(coalesce(admin_note, '')) <= 2000) not valid;

alter table finishing_material_orders drop constraint if exists finishing_orders_text_limits;
alter table finishing_material_orders add constraint finishing_orders_text_limits
  check (char_length(project_name) <= 200 and char_length(delivery_address) <= 1000 and char_length(coalesce(admin_note, '')) <= 2000) not valid;

alter table finished_house_service_requests drop constraint if exists service_requests_text_limits;
alter table finished_house_service_requests add constraint service_requests_text_limits
  check (char_length(description) <= 4000 and char_length(property_address) <= 1000
         and char_length(coalesce(admin_note, '')) <= 2000 and char_length(coalesce(completion_report, '')) <= 4000) not valid;

alter table design_studio_bookings drop constraint if exists design_bookings_text_limits;
alter table design_studio_bookings add constraint design_bookings_text_limits
  check (char_length(description) <= 4000 and char_length(coalesce(admin_note, '')) <= 2000 and octet_length(details::text) <= 6000) not valid;

alter table trust_reports drop constraint if exists trust_reports_text_limit;
alter table trust_reports add constraint trust_reports_text_limit
  check (report_text is null or char_length(report_text) <= 8000) not valid;

-- ----------------------------------------------------------------------------
-- 9. SHARE-LINK HYGIENE. (a) One active link per creator per resource -
-- double-clicking "Create Share Link" made duplicates that also broke the UI
-- lookup (extras are revoked, oldest kept, so this can't fail on old data).
-- (b) New tokens are URL-safe (the old alphabet included '+'), and no longer
-- depend on the pgcrypto extension: two random UUIDs = 244 random bits.
-- ----------------------------------------------------------------------------
update public_share_links l set revoked_at = now()
where l.revoked_at is null and exists (
  select 1 from public_share_links o
  where o.resource_type = l.resource_type and o.resource_id = l.resource_id
    and o.created_by = l.created_by and o.revoked_at is null
    and (o.created_at, o.id) < (l.created_at, l.id)
);
create unique index if not exists uq_share_one_active_per_creator
  on public_share_links (resource_type, resource_id, created_by) where revoked_at is null;

alter table public_share_links alter column token set default
  translate(encode(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_');

-- ----------------------------------------------------------------------------
-- 10. STORAGE: file-type allow-lists (size limits already existed). Evidence
-- photos are always re-encoded to JPEG in the browser before upload; Ask
-- Vastu accepts exactly the types its own validator allows. UPDATE on
-- storage.buckets is permitted (only DELETE is blocked by Supabase).
-- ----------------------------------------------------------------------------
update storage.buckets set allowed_mime_types = array['image/jpeg'] where id = 'checkpoint-evidence';
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'] where id = 'vastu-chat-files';


-- ----------------------------------------------------------------------------
-- 11. SHARE LINKS: AUTHORIZATION WAS CHECKED AT INSERT, NEVER AGAIN. The insert
-- policy verifies you belong to the project / firm you are linking - but the
-- update policy only asked "are you the creator?". Confirmed by exploit: a user
-- created a legitimate link to their own project, repointed it (resource_id) at
-- another user's private project, and an anonymous visitor then read that
-- project's reports through the link; the token itself could also be replaced
-- with a chosen value. A link can now only be REVOKED (null -> a timestamp) and
-- never re-enabled; its target, type, owner and token are frozen.
-- ----------------------------------------------------------------------------
create or replace function enforce_share_link_revoke_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    if (to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at') then
      raise exception 'A share link can only be revoked - its target and token can never be changed';
    end if;
    if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
      raise exception 'A revoked share link cannot be re-enabled - create a new one';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists share_link_revoke_only_trigger on public_share_links;
create trigger share_link_revoke_only_trigger
  before update on public_share_links
  for each row execute function enforce_share_link_revoke_only();

-- ----------------------------------------------------------------------------
-- 12. FIRMS: A FIRM ADMIN COULD ACTIVATE THEIR OWN SUBSCRIPTION. The policy that
-- lets a firm admin update their firm (meant for renaming) never limited which
-- columns. Confirmed by exploit: a firm admin set their own firm's
-- subscription_status from 'pending' to 'active' - skipping payment entirely.
-- Now only the name can change through the API for anyone but the platform
-- admin. (Nothing in the app writes to firms at all; verified by search.)
-- ----------------------------------------------------------------------------
create or replace function enforce_firm_name_only_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not current_user_is_admin() then
    if (to_jsonb(new) - 'name') is distinct from (to_jsonb(old) - 'name') then
      raise exception 'Only the firm name can be changed here - subscription status is managed by the Adrith team';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists firm_name_only_trigger on firms;
create trigger firm_name_only_trigger
  before update on firms
  for each row execute function enforce_firm_name_only_update();

-- ----------------------------------------------------------------------------
-- 13. AI-COST CAPS COULD BE BACKDATED. Every AI rate limit counts rows by
-- created_at >= today. A reservation row is user-updatable while pending, so a
-- user could rewrite created_at into the past and stop it counting. Confirmed by
-- exploit: at the 20/day cap, rewriting created_at let 10 more analyses through.
-- Ownership and timestamp columns on both AI ledgers are now frozen for anyone
-- going through the API. (Service role and SQL-editor edits are unaffected.)
-- The remaining hole in this area - a user deleting their own pending
-- reservation mid-call to free the slot - can only be closed by moving
-- release/complete server-side: see patch-trust-reports-lockdown.sql.
-- ----------------------------------------------------------------------------
create or replace function enforce_immutable_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare col text;
begin
  if auth.uid() is not null then
    foreach col in array tg_argv loop
      if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
        raise exception 'The % of this record cannot be changed', col;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists immutable_columns_trigger on material_analysis_attempts;
create trigger immutable_columns_trigger
  before update on material_analysis_attempts
  for each row execute function enforce_immutable_columns('user_id', 'created_at');

drop trigger if exists immutable_columns_trigger on trust_reports;
create trigger immutable_columns_trigger
  before update on trust_reports
  for each row execute function enforce_immutable_columns('project_id', 'generated_by', 'created_at');

-- The functions above are new and SECURITY INVOKER (no elevated rights), so they
-- need no grant changes; the definer-function passes earlier in this patch
-- already ran, and nothing here creates a definer function.

-- Patch complete.
