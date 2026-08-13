-- ============================================================================
-- PATCH — Landscaping & Gardening: replaces the "Color & Flooring" SOON
-- placeholder in the dashboard entirely, not an addition alongside it.
--
-- Two parts, confirmed directly:
-- 1) A browsable plant/garden catalog (lib/landscaping/catalog-data.ts) -
--    static reference data with search, same pattern as Standard Heights.
--    No AI call needed for this part; the compiled research data IS the
--    answer, the same way Standard Heights doesn't need AI either.
-- 2) A selection + vendor-connection flow, confirmed directly to mirror
--    the Material Calculator's shop-owner pattern exactly: pick items,
--    finalize, invite a real vendor to quote, ADRITH never touches
--    money or inventory. Design consultation is out of scope for this
--    schema entirely - confirmed directly as a simple phone-number
--    redirect in the UI, not a feature with its own data model.
--
-- Reuses the shop_owner role rather than adding a new one - a nursery is
-- the same generic kind of external vendor as a plumbing/electrical
-- materials shop, no reason to introduce a second concept for it.
--
-- Applied the circular-RLS-reference fix from the start this time,
-- rather than discovering it the hard way again: landscaping_selections'
-- "invited vendor can view" policy uses a security-definer helper
-- function to check landscaping_vendor_invites, exactly the same fix
-- already proven for material_lists / material_list_shop_invites -
-- learned once, applied proactively here instead of re-finding the same
-- bug in a new table pair.
-- ============================================================================
create table if not exists landscaping_selections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  created_by uuid not null references profiles (id),
  items jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  finalized_by uuid references profiles (id),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table landscaping_selections enable row level security;

create table if not exists landscaping_vendor_invites (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null references landscaping_selections (id) on delete cascade,
  vendor_id uuid not null references profiles (id),
  invited_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  unique (selection_id, vendor_id)
);

alter table landscaping_vendor_invites enable row level security;

-- Applying the fix proactively - see header note.
create or replace function is_invited_landscaping_vendor(target_selection_id uuid)
returns boolean as $$
  select exists (
    select 1 from landscaping_vendor_invites
    where selection_id = target_selection_id and vendor_id = auth.uid()
  );
$$ language sql security definer stable;

drop policy if exists "project members can view their landscaping selections" on landscaping_selections;
drop policy if exists "invited vendors can view selections shared with them" on landscaping_selections;
drop policy if exists "project members can create landscaping selections" on landscaping_selections;
drop policy if exists "creator can update their own draft selection" on landscaping_selections;

create policy "project members can view their landscaping selections"
  on landscaping_selections for select
  to authenticated
  using (is_project_member(project_id) or current_user_is_admin());

create policy "invited vendors can view selections shared with them"
  on landscaping_selections for select
  to authenticated
  using (is_invited_landscaping_vendor(id));

create policy "project members can create landscaping selections"
  on landscaping_selections for insert
  to authenticated
  with check (created_by = auth.uid() and is_project_member(project_id));

create policy "creator can update their own draft selection"
  on landscaping_selections for update
  to authenticated
  using (created_by = auth.uid() and is_project_member(project_id))
  with check (created_by = auth.uid());

create or replace function enforce_landscaping_selection_lock()
returns trigger as $$
begin
  if old.status = 'finalized' then
    raise exception 'This selection is finalized and permanently locked. Create a new selection for any change.';
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists enforce_landscaping_selection_lock_trigger on landscaping_selections;
create trigger enforce_landscaping_selection_lock_trigger
  before update on landscaping_selections
  for each row execute function enforce_landscaping_selection_lock();

drop policy if exists "project members can view invites on their selections" on landscaping_vendor_invites;
drop policy if exists "vendors can view their own invites" on landscaping_vendor_invites;
drop policy if exists "selection creator can invite a vendor to a finalized selection" on landscaping_vendor_invites;

create policy "project members can view invites on their selections"
  on landscaping_vendor_invites for select
  to authenticated
  using (
    exists (select 1 from landscaping_selections s where s.id = selection_id and is_project_member(s.project_id))
  );

create policy "vendors can view their own invites"
  on landscaping_vendor_invites for select
  to authenticated
  using (vendor_id = auth.uid());

create policy "selection creator can invite a vendor to a finalized selection"
  on landscaping_vendor_invites for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and exists (
      select 1 from landscaping_selections s
      where s.id = selection_id and s.created_by = auth.uid() and s.status = 'finalized'
    )
  );

-- ----------------------------------------------------------------------------
-- Quotations - immutable once submitted, same principle as
-- material_list_quotations: a real record of what was quoted and when.
-- ADRITH never calculates or verifies the vendor's price.
-- ----------------------------------------------------------------------------
create table if not exists landscaping_quotations (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null references landscaping_selections (id) on delete cascade,
  vendor_id uuid not null references profiles (id),
  quote_details text not null,
  created_at timestamptz not null default now()
);

alter table landscaping_quotations enable row level security;

create policy "project members can view quotations on their selections"
  on landscaping_quotations for select
  to authenticated
  using (
    exists (select 1 from landscaping_selections s where s.id = selection_id and is_project_member(s.project_id))
  );

create policy "a vendor can view their own submitted quotations"
  on landscaping_quotations for select
  to authenticated
  using (vendor_id = auth.uid());

create policy "invited vendors can submit a quotation"
  on landscaping_quotations for insert
  to authenticated
  with check (vendor_id = auth.uid() and is_invited_landscaping_vendor(selection_id));

create index if not exists idx_landscaping_selections_project_id on landscaping_selections (project_id);
create index if not exists idx_landscaping_vendor_invites_selection_id on landscaping_vendor_invites (selection_id);
create index if not exists idx_landscaping_quotations_selection_id on landscaping_quotations (selection_id);
