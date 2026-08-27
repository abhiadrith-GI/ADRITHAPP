
-- ============================================================================
-- HOMECARE: RCC MATERIALS SUPPLY (first of four planned HomeCare bases -
-- Civil Material Supply, Finishing Material Supply, Construction Labour
-- Services, Finished House Services still to come)
--
-- Marketplace-commission model, but payment is admin-mediated for now:
-- the customer pays the full listed price straight to the platform owner
-- inside the app (once a gateway is wired in); the owner separately pays
-- whichever vendor fulfilled the order, outside the app. No vendor
-- accounts and no payment gateway yet - both deliberately deferred.
-- Vendor coordination happens by phone/WhatsApp, outside the app.
--
-- Status lifecycle for rcc_material_orders:
--   placed          - customer submitted the order, quantities as they typed them
--   adjusted        - admin confirmed with the vendor but changed a quantity;
--                     customer must explicitly review and approve before paying
--   awaiting_payment - ready to pay: reached directly from 'placed' if admin
--                      confirmed with no changes (nothing to approve), or from
--                      'adjusted' once the customer approves
--   paid            - marked by the admin for now (no gateway yet - real
--                      payment happens outside the app in the meantime, e.g.
--                      UPI/bank transfer, and gets recorded here manually)
--   complete        - delivered, closed out
--   cancelled       - stopped at any point
-- ============================================================================

create table rcc_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('rcc_work', 'steel_work', 'brick_work', 'plastering')),
  unit text not null,
  customer_price numeric(10, 2) not null check (customer_price >= 0),
  vendor_payout numeric(10, 2) not null check (vendor_payout >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rcc_materials enable row level security;

drop policy if exists "anyone logged in can view active materials" on rcc_materials;
drop policy if exists "only admin can add materials" on rcc_materials;
drop policy if exists "only admin can edit materials" on rcc_materials;
drop policy if exists "only admin can remove materials" on rcc_materials;

-- Admin sees inactive/retired materials too (to be able to re-enable them);
-- everyone else only ever sees what's currently orderable.
create policy "anyone logged in can view active materials"
  on rcc_materials for select
  to authenticated
  using (is_active or current_user_is_admin());

create policy "only admin can add materials"
  on rcc_materials for insert
  to authenticated
  with check (current_user_is_admin());

create policy "only admin can edit materials"
  on rcc_materials for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

create policy "only admin can remove materials"
  on rcc_materials for delete
  to authenticated
  using (current_user_is_admin());


create table rcc_material_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id),
  project_name text not null,
  delivery_address text not null,
  status text not null default 'placed' check (
    status in ('placed', 'adjusted', 'awaiting_payment', 'paid', 'complete', 'cancelled')
  ),
  admin_note text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz
);

alter table rcc_material_orders enable row level security;

drop policy if exists "users can view their own orders" on rcc_material_orders;
drop policy if exists "users can create their own orders" on rcc_material_orders;
drop policy if exists "users can approve their own adjusted order" on rcc_material_orders;
drop policy if exists "only admin can update order status and notes" on rcc_material_orders;
drop policy if exists "only admin can cancel any order" on rcc_material_orders;

create policy "users can view their own orders"
  on rcc_material_orders for select
  to authenticated
  using (user_id = auth.uid() or current_user_is_admin());

create policy "users can create their own orders"
  on rcc_material_orders for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'placed');

-- The one thing a customer can do to their own order without being admin:
-- approve an adjustment so it becomes payable. Everything else about an
-- order's status is an admin action, via the broader policy right below.
create policy "users can approve their own adjusted order"
  on rcc_material_orders for update
  to authenticated
  using (user_id = auth.uid() and status = 'adjusted')
  with check (user_id = auth.uid() and status = 'awaiting_payment');

create policy "only admin can update order status and notes"
  on rcc_material_orders for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());


create table rcc_material_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references rcc_material_orders (id) on delete cascade,
  material_id uuid not null references rcc_materials (id),
  material_name text not null,
  unit text not null,
  quantity_requested numeric(10, 2) not null check (quantity_requested > 0),
  quantity_confirmed numeric(10, 2),
  unit_customer_price numeric(10, 2) not null,
  unit_vendor_payout numeric(10, 2) not null
);

alter table rcc_material_order_items enable row level security;

drop policy if exists "users can view their own order items" on rcc_material_order_items;
drop policy if exists "users can add items to their own new order" on rcc_material_order_items;
drop policy if exists "only admin can adjust order item quantities" on rcc_material_order_items;

create policy "users can view their own order items"
  on rcc_material_order_items for select
  to authenticated
  using (
    exists (
      select 1 from rcc_material_orders o
      where o.id = order_id and (o.user_id = auth.uid() or current_user_is_admin())
    )
  );

create policy "users can add items to their own new order"
  on rcc_material_order_items for insert
  to authenticated
  with check (
    exists (select 1 from rcc_material_orders o where o.id = order_id and o.user_id = auth.uid() and o.status = 'placed')
  );

create policy "only admin can adjust order item quantities"
  on rcc_material_order_items for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

create index if not exists idx_rcc_material_orders_user_id on rcc_material_orders (user_id);
create index if not exists idx_rcc_material_order_items_order_id on rcc_material_order_items (order_id);
create index if not exists idx_rcc_materials_category on rcc_materials (category);

-- ----------------------------------------------------------------------------
-- Seed data: the finalized material list. Prices below are placeholders,
-- not researched market rates - Abhinandan sets and maintains the real
-- customer_price / vendor_payout for every item via the admin catalog
-- page. Safe to re-run: on conflict does nothing, so re-running this after
-- prices have been edited in the app won't silently reset them.
-- ----------------------------------------------------------------------------
insert into rcc_materials (name, category, unit, customer_price, vendor_payout, sort_order) values
  ('Cement (OPC 53 Grade)', 'rcc_work', 'bag', 380, 360, 10),
  ('Sand (River/M-Sand)', 'rcc_work', 'cft', 65, 58, 20),
  ('Gelly (Aggregate 20mm)', 'rcc_work', 'cft', 55, 48, 30),
  ('TMT Steel 8mm', 'rcc_work', 'rod', 450, 420, 40),
  ('TMT Steel 10mm', 'rcc_work', 'rod', 700, 655, 41),
  ('TMT Steel 12mm', 'rcc_work', 'rod', 1000, 935, 42),
  ('TMT Steel 16mm', 'rcc_work', 'rod', 1780, 1665, 43),
  ('TMT Steel 20mm', 'rcc_work', 'rod', 2780, 2600, 44),
  ('TMT Steel 25mm', 'rcc_work', 'rod', 4340, 4060, 45),
  ('Binding Wire', 'rcc_work', 'kg', 75, 68, 50),
  ('Cover Blocks / Spacers', 'rcc_work', 'nos', 2, 1.6, 60),
  ('Chairs (Rebar Support)', 'rcc_work', 'nos', 8, 7, 70),
  ('Nails', 'rcc_work', 'kg', 90, 82, 80),
  ('Curing Compound', 'rcc_work', 'litre', 140, 125, 90),
  ('Concrete Admixture (Plasticizer)', 'rcc_work', 'litre', 180, 160, 100),
  ('Polythene Sheet', 'rcc_work', 'roll', 850, 770, 110),
  ('Shuttering Oil / De-bonding Compound', 'rcc_work', 'litre', 95, 85, 120),

  ('Burnt Bricks', 'brick_work', 'nos', 9, 8, 10),
  ('Cement Solid Blocks', 'brick_work', 'nos', 42, 38, 20),
  ('Cement Hollow Blocks', 'brick_work', 'nos', 38, 34, 30),
  ('Light-Weight Blocks (AAC)', 'brick_work', 'nos', 68, 62, 40),

  ('Chicken Mesh / Wire Mesh', 'plastering', 'roll', 950, 860, 10),
  ('Sponge Float', 'plastering', 'nos', 90, 80, 20),
  ('Corner Beads', 'plastering', 'nos', 35, 30, 30),
  ('Waterproofing Compound', 'plastering', 'litre', 210, 190, 40),
  ('Bonding Agent (SBR)', 'plastering', 'litre', 260, 235, 50)
on conflict (name) do nothing;
