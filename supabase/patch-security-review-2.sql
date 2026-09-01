-- ============================================================================
-- PATCH — Security review (2026-08, follow-up after HomeCare + Design
-- Studio). Run once in the Supabase SQL Editor. Already folded into
-- schema.sql for a from-scratch build. Safe to run multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Real gap: nothing server-side verified that an order's stored price
-- actually matched the catalog. A technical user could tamper with the
-- client-side insert to submit an arbitrarily low unit_customer_price,
-- and unless the admin manually cross-checked every line item's price
-- during confirmation (confirmAsIs/confirmWithChanges only ever touch
-- quantity_confirmed, never re-verify price), a manipulated order could
-- reach payment at the wrong price. Fixed with a trigger that looks up
-- the real, current catalog values by material_id and overwrites
-- whatever the client sent, on every insert, no exceptions. Applies to
-- both RCC and Finishing Materials - same underlying table pattern, same
-- gap, same fix.
-- ----------------------------------------------------------------------------
create or replace function enforce_rcc_order_item_pricing()
returns trigger as $$
begin
  select name, unit, customer_price, vendor_payout
  into new.material_name, new.unit, new.unit_customer_price, new.unit_vendor_payout
  from rcc_materials
  where id = new.material_id;

  if not found then
    raise exception 'Material % does not exist or is no longer active', new.material_id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_rcc_order_item_pricing_trigger on rcc_material_order_items;
create trigger enforce_rcc_order_item_pricing_trigger
  before insert on rcc_material_order_items
  for each row execute function enforce_rcc_order_item_pricing();

create or replace function enforce_finishing_order_item_pricing()
returns trigger as $$
begin
  select name, unit, customer_price, vendor_payout
  into new.material_name, new.unit, new.unit_customer_price, new.unit_vendor_payout
  from finishing_materials
  where id = new.material_id;

  if not found then
    raise exception 'Material % does not exist or is no longer active', new.material_id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_finishing_order_item_pricing_trigger on finishing_material_order_items;
create trigger enforce_finishing_order_item_pricing_trigger
  before insert on finishing_material_order_items
  for each row execute function enforce_finishing_order_item_pricing();

-- ----------------------------------------------------------------------------
-- 2. Smaller, lower-severity gap: the service-request insert policy never
-- explicitly blocked a customer from self-setting quoted_price or other
-- quote-related fields at insert time. The app's own code never does
-- this, and even if it did, admin still has to separately move the
-- status to 'quoted' before a customer could act on it - so this was
-- never actually exploitable for real harm. Tightened anyway, since
-- there's no reason to leave it open.
-- ----------------------------------------------------------------------------
drop policy if exists "users can create their own service requests" on finished_house_service_requests;
create policy "users can create their own service requests"
  on finished_house_service_requests for insert
  to authenticated
  with check (
    user_id = auth.uid() and status = 'enquired'
    and quoted_price is null and scheduled_date is null and admin_note is null and completion_report is null
  );

-- ----------------------------------------------------------------------------
-- 3. Defense-in-depth: the design-studio-files bucket had a size limit
-- but no MIME type restriction. Only admin can upload here, so the real
-- risk is low, but there's no reason not to enforce this at the storage
-- layer too rather than relying solely on the client-side accept
-- attribute (which is a UI hint, not a real restriction).
-- ----------------------------------------------------------------------------
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
where id = 'design-studio-files';

-- Patch complete.
