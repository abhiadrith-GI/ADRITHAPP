-- ============================================================================
-- PATCH - Security review #7 (2026-11). Run once in the Supabase SQL Editor.
-- Already folded into schema.sql for a from-scratch build. Safe to re-run.
-- Proven against a real PostgreSQL instance loaded with this project's schema.
-- ============================================================================

do $$
begin
  if to_regprocedure('public.enforce_evidence_stage_open()') is null then
    raise exception 'STOPPED BEFORE CHANGING ANYTHING - run patch-security-review-6.sql first, then run this file again.';
  end if;
end $$;

-- 1. A single order could hold unlimited item rows. Cap at 100 per order,
--    and bound the quantity of any one line.
create or replace function public.enforce_order_item_count()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  execute format('select count(*) from public.%I where order_id = $1', tg_table_name)
    into n using new.order_id;
  if n >= 100 then
    raise exception 'An order can hold at most 100 items.';
  end if;
  return new;
end $$;
revoke all on function public.enforce_order_item_count() from public, anon, authenticated;

drop trigger if exists order_item_count_trigger on public.rcc_material_order_items;
create trigger order_item_count_trigger before insert on public.rcc_material_order_items
  for each row execute function public.enforce_order_item_count();
drop trigger if exists order_item_count_trigger on public.finishing_material_order_items;
create trigger order_item_count_trigger before insert on public.finishing_material_order_items
  for each row execute function public.enforce_order_item_count();

do $$
declare t text;
begin
  foreach t in array array['rcc_material_order_items','finishing_material_order_items'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_qty_max' and conrelid = ('public.'||t)::regclass) then
      execute format('alter table public.%I add constraint %I check (quantity_requested <= 1000000) not valid', t, t || '_qty_max');
    end if;
  end loop;
end $$;

-- 2. Free-text columns users can write had no size limit.
do $$
declare r record;
begin
  for r in select * from (values
    ('rcc_material_order_items','material_name'),('rcc_material_order_items','unit'),
    ('finishing_material_order_items','material_name'),('finishing_material_order_items','unit'),
    ('material_lists','trade'),('material_lists','room_type'),('material_lists','source_type'),
    ('project_folder_files','category'),('project_folder_files','file_type'),
    ('projects','requested_start_stage_key'),('projects','created_in_tool'),
    ('quantity_calculations','stage_group_key'),
    ('public_share_links','resource_type'),('public_share_links','token'),
    ('design_studio_bookings','category'),('finished_house_service_requests','service_type')
  ) v(tbl, col) loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=r.tbl and column_name=r.col)
       and not exists (select 1 from pg_constraint where conname = r.tbl || '_' || r.col || '_len' and conrelid = ('public.'||r.tbl)::regclass) then
      execute format('alter table public.%I add constraint %I check (length(%I) <= 200) not valid', r.tbl, r.tbl || '_' || r.col || '_len', r.col);
    end if;
  end loop;
end $$;

-- 3. Share-link tokens must be server-generated, never chosen by the client.
create or replace function public.force_share_token()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.token := translate(encode(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_');
  return new;
end $$;
revoke all on function public.force_share_token() from public, anon, authenticated;

drop trigger if exists force_share_token_trigger on public.public_share_links;
create trigger force_share_token_trigger before insert on public.public_share_links
  for each row execute function public.force_share_token();
