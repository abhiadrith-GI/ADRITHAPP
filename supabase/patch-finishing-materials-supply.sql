
-- ============================================================================
-- HOMECARE: FINISHING MATERIAL SUPPLY (second of four planned HomeCare
-- bases). Same structure and RLS pattern as rcc_materials/rcc_material_
-- orders/rcc_material_order_items - separate tables rather than shared
-- ones, since the category sets and reporting needs are genuinely
-- different, not because the underlying logic differs. Same deferred-
-- payment, no-vendor-login, admin-mediated design as RCC Materials.
-- ============================================================================

create table finishing_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (
    category in ('paints_finishes', 'doors_windows_wood_hardware', 'glass_glazing', 'tiles_flooring', 'stainless_steel', 'plumbing_electrical_fixtures')
  ),
  unit text not null,
  customer_price numeric(10, 2) not null check (customer_price >= 0),
  vendor_payout numeric(10, 2) not null check (vendor_payout >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table finishing_materials enable row level security;

drop policy if exists "anyone logged in can view active finishing materials" on finishing_materials;
drop policy if exists "only admin can add finishing materials" on finishing_materials;
drop policy if exists "only admin can edit finishing materials" on finishing_materials;
drop policy if exists "only admin can remove finishing materials" on finishing_materials;

create policy "anyone logged in can view active finishing materials"
  on finishing_materials for select
  to authenticated
  using (is_active or current_user_is_admin());

create policy "only admin can add finishing materials"
  on finishing_materials for insert
  to authenticated
  with check (current_user_is_admin());

create policy "only admin can edit finishing materials"
  on finishing_materials for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

create policy "only admin can remove finishing materials"
  on finishing_materials for delete
  to authenticated
  using (current_user_is_admin());


create table finishing_material_orders (
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

alter table finishing_material_orders enable row level security;

drop policy if exists "users can view their own finishing orders" on finishing_material_orders;
drop policy if exists "users can create their own finishing orders" on finishing_material_orders;
drop policy if exists "users can approve their own adjusted finishing order" on finishing_material_orders;
drop policy if exists "only admin can update finishing order status and notes" on finishing_material_orders;

create policy "users can view their own finishing orders"
  on finishing_material_orders for select
  to authenticated
  using (user_id = auth.uid() or current_user_is_admin());

create policy "users can create their own finishing orders"
  on finishing_material_orders for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'placed');

create policy "users can approve their own adjusted finishing order"
  on finishing_material_orders for update
  to authenticated
  using (user_id = auth.uid() and status = 'adjusted')
  with check (user_id = auth.uid() and status = 'awaiting_payment');

create policy "only admin can update finishing order status and notes"
  on finishing_material_orders for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());


create table finishing_material_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references finishing_material_orders (id) on delete cascade,
  material_id uuid not null references finishing_materials (id),
  material_name text not null,
  unit text not null,
  quantity_requested numeric(10, 2) not null check (quantity_requested > 0),
  quantity_confirmed numeric(10, 2),
  unit_customer_price numeric(10, 2) not null,
  unit_vendor_payout numeric(10, 2) not null
);

alter table finishing_material_order_items enable row level security;

drop policy if exists "users can view their own finishing order items" on finishing_material_order_items;
drop policy if exists "users can add items to their own new finishing order" on finishing_material_order_items;
drop policy if exists "only admin can adjust finishing order item quantities" on finishing_material_order_items;

create policy "users can view their own finishing order items"
  on finishing_material_order_items for select
  to authenticated
  using (
    exists (
      select 1 from finishing_material_orders o
      where o.id = order_id and (o.user_id = auth.uid() or current_user_is_admin())
    )
  );

create policy "users can add items to their own new finishing order"
  on finishing_material_order_items for insert
  to authenticated
  with check (
    exists (select 1 from finishing_material_orders o where o.id = order_id and o.user_id = auth.uid() and o.status = 'placed')
  );

create policy "only admin can adjust finishing order item quantities"
  on finishing_material_order_items for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

create index if not exists idx_finishing_material_orders_user_id on finishing_material_orders (user_id);
create index if not exists idx_finishing_material_order_items_order_id on finishing_material_order_items (order_id);
create index if not exists idx_finishing_materials_category on finishing_materials (category);

-- ----------------------------------------------------------------------------
-- Seed data: the finalized Finishing Materials catalog. Prices are
-- placeholders, not researched market rates - set and maintained via the
-- admin catalog page, same as RCC Materials. Idempotent via the unique
-- constraint on name.
-- ----------------------------------------------------------------------------
insert into finishing_materials (name, category, unit, customer_price, vendor_payout, sort_order) values
  -- Paints & Finishes
  ('Asian Paints Tractor Emulsion', 'paints_finishes', 'litre', 210, 190, 10),
  ('Asian Paints Premium Emulsion', 'paints_finishes', 'litre', 280, 255, 20),
  ('Asian Paints Royale Luxury Emulsion', 'paints_finishes', 'litre', 420, 385, 30),
  ('Asian Paints Royale Matt Emulsion', 'paints_finishes', 'litre', 440, 400, 40),
  ('Asian Paints Ace Exterior Emulsion', 'paints_finishes', 'litre', 260, 235, 50),
  ('Asian Paints Apex Exterior Emulsion', 'paints_finishes', 'litre', 340, 310, 60),
  ('Asian Paints Apex Ultima Protek', 'paints_finishes', 'litre', 480, 440, 70),
  ('Asian Paints Trucare Wall Primer', 'paints_finishes', 'litre', 175, 158, 80),
  ('Asian Paints Trucare Wall Putty', 'paints_finishes', 'kg', 42, 38, 90),
  ('Asian Paints Apcolite Premium Enamel', 'paints_finishes', 'litre', 380, 345, 100),
  ('Berger Bison Acrylic Emulsion', 'paints_finishes', 'litre', 195, 176, 110),
  ('Berger Rangoli Total Care Emulsion', 'paints_finishes', 'litre', 260, 235, 120),
  ('Berger Silk Luxury Emulsion', 'paints_finishes', 'litre', 400, 365, 130),
  ('Berger WeatherCoat Long Life', 'paints_finishes', 'litre', 320, 292, 140),
  ('Berger WeatherCoat All Guard', 'paints_finishes', 'litre', 360, 328, 150),
  ('Berger Wall Putty', 'paints_finishes', 'kg', 40, 36, 160),
  ('Berger Dampstop Advanced', 'paints_finishes', 'litre', 290, 264, 170),

  -- Doors, Windows, Wood & Hardware
  ('Teak Wood - 4"x2.5" Section', 'doors_windows_wood_hardware', 'cft', 3400, 3150, 10),
  ('Teak Wood - 5"x2.5" Section', 'doors_windows_wood_hardware', 'cft', 3400, 3150, 20),
  ('Sal Wood - 4"x2.5" Section', 'doors_windows_wood_hardware', 'cft', 1450, 1330, 30),
  ('Sal Wood - 5"x2.5" Section', 'doors_windows_wood_hardware', 'cft', 1450, 1330, 40),
  ('Meranti Wood - 4"x2.5" Section', 'doors_windows_wood_hardware', 'cft', 1100, 1010, 50),
  ('Flush Door Shutter (32mm)', 'doors_windows_wood_hardware', 'nos', 2800, 2560, 60),
  ('Panel Door Shutter (35mm)', 'doors_windows_wood_hardware', 'nos', 4200, 3850, 70),
  ('Butt Hinges (4 inch)', 'doors_windows_wood_hardware', 'nos', 55, 48, 80),
  ('Mortise Lock Set', 'doors_windows_wood_hardware', 'nos', 950, 870, 90),
  ('Door Handle (Main Door)', 'doors_windows_wood_hardware', 'nos', 650, 590, 100),
  ('Tower Bolt', 'doors_windows_wood_hardware', 'nos', 85, 75, 110),
  ('Door Closer (Hydraulic)', 'doors_windows_wood_hardware', 'nos', 1200, 1100, 120),
  ('Kick Plate', 'doors_windows_wood_hardware', 'nos', 220, 195, 130),
  ('Casement Window Friction Hinge', 'doors_windows_wood_hardware', 'nos', 180, 160, 140),
  ('Window Sash Lock', 'doors_windows_wood_hardware', 'nos', 140, 125, 150),

  -- Glass & Glazing
  ('Plain Float Glass (5mm)', 'glass_glazing', 'sqft', 90, 80, 10),
  ('Sun Ban Solar Control Glass', 'glass_glazing', 'sqft', 220, 200, 20),
  ('Laminated Glass', 'glass_glazing', 'sqft', 260, 235, 30),
  ('DGU (Double Glazed Unit)', 'glass_glazing', 'sqft', 480, 440, 40),
  ('Toughened Glass (10mm)', 'glass_glazing', 'sqft', 210, 190, 50),
  ('Glazing Beads', 'glass_glazing', 'rft', 25, 22, 60),
  ('Silicone Sealant', 'glass_glazing', 'nos', 320, 290, 70),
  ('Glass Clamps / Patch Fittings', 'glass_glazing', 'nos', 180, 160, 80),

  -- Tiles & Flooring
  ('Ceramic Floor Tile', 'tiles_flooring', 'sqft', 45, 40, 10),
  ('Vitrified Floor Tile', 'tiles_flooring', 'sqft', 75, 68, 20),
  ('Wall Tile', 'tiles_flooring', 'sqft', 55, 49, 30),
  ('Tile Adhesive', 'tiles_flooring', 'kg', 18, 16, 40),
  ('Cement Grout', 'tiles_flooring', 'kg', 35, 31, 50),
  ('Epoxy Grout', 'tiles_flooring', 'kg', 120, 108, 60),
  ('Tile Spacers', 'tiles_flooring', 'nos', 2, 1.6, 70),
  ('Tile Leveling Clips', 'tiles_flooring', 'nos', 4, 3.4, 80),
  ('Natural Stone Sealer', 'tiles_flooring', 'litre', 380, 345, 90),

  -- Stainless Steel
  ('SS Railing Pipe (2 inch)', 'stainless_steel', 'rft', 320, 290, 10),
  ('SS Balusters', 'stainless_steel', 'nos', 450, 410, 20),
  ('SS Sheet (304 Grade)', 'stainless_steel', 'sqft', 280, 255, 30),
  ('SS Welding Rod', 'stainless_steel', 'kg', 850, 780, 40),

  -- Plumbing & Electrical Fixtures
  ('Wash Basin', 'plumbing_electrical_fixtures', 'nos', 2200, 2000, 10),
  ('Water Closet (WC)', 'plumbing_electrical_fixtures', 'nos', 5500, 5050, 20),
  ('Health Faucet', 'plumbing_electrical_fixtures', 'nos', 650, 590, 30),
  ('Shower Set', 'plumbing_electrical_fixtures', 'nos', 3200, 2950, 40),
  ('CP Angle Valve', 'plumbing_electrical_fixtures', 'nos', 320, 290, 50),
  ('CP Bib Cock', 'plumbing_electrical_fixtures', 'nos', 380, 345, 60),
  ('Modular Switch', 'plumbing_electrical_fixtures', 'nos', 45, 40, 70),
  ('Modular Socket', 'plumbing_electrical_fixtures', 'nos', 65, 58, 80),
  ('MCB', 'plumbing_electrical_fixtures', 'nos', 180, 162, 90),
  ('Distribution Board (8-way)', 'plumbing_electrical_fixtures', 'nos', 1400, 1280, 100),
  ('LED Light Fixture', 'plumbing_electrical_fixtures', 'nos', 850, 775, 110),
  ('Ceiling Fan', 'plumbing_electrical_fixtures', 'nos', 2400, 2200, 120)
on conflict (name) do nothing;
