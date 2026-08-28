
-- ============================================================================
-- ADRITH DESIGN STUDIO - a pure enquiry-and-delivery platform, not a
-- generative tool. The app creates nothing here: a user books one of four
-- independent categories (Concept Plan, 3D Designs, Civil Execution
-- Drawings, Finishing Execution Drawings), Abhinandan or the Adrith team
-- does the real design work entirely outside the app, then uploads the
-- finished PDFs/images against that booking. Open to any subscribed user,
-- not scoped to Adrith's own clients only.
--
-- Pricing deliberately not modeled yet - the pattern hasn't been decided.
-- No payment flow in this version; add once pricing is settled.
-- ============================================================================

create table design_studio_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id),
  category text not null check (
    category in ('concept_plan', 'three_d_designs', 'civil_execution_drawings', 'finishing_execution_drawings')
  ),
  description text not null,
  status text not null default 'booked' check (status in ('booked', 'in_progress', 'delivered', 'cancelled')),
  admin_note text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

alter table design_studio_bookings enable row level security;

drop policy if exists "users can view their own design studio bookings" on design_studio_bookings;
drop policy if exists "users can create their own design studio bookings" on design_studio_bookings;
drop policy if exists "only admin can update design studio bookings" on design_studio_bookings;

create policy "users can view their own design studio bookings"
  on design_studio_bookings for select
  to authenticated
  using (user_id = auth.uid() or current_user_is_admin());

create policy "users can create their own design studio bookings"
  on design_studio_bookings for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'booked');

create policy "only admin can update design studio bookings"
  on design_studio_bookings for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());


create table design_studio_deliverables (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references design_studio_bookings (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now()
);

alter table design_studio_deliverables enable row level security;

drop policy if exists "users can view deliverables for their own bookings" on design_studio_deliverables;
drop policy if exists "only admin can add deliverables" on design_studio_deliverables;

create policy "users can view deliverables for their own bookings"
  on design_studio_deliverables for select
  to authenticated
  using (
    exists (
      select 1 from design_studio_bookings b
      where b.id = booking_id and (b.user_id = auth.uid() or current_user_is_admin())
    )
  );

create policy "only admin can add deliverables"
  on design_studio_deliverables for insert
  to authenticated
  with check (current_user_is_admin());

create index if not exists idx_design_studio_bookings_user_id on design_studio_bookings (user_id);
create index if not exists idx_design_studio_deliverables_booking_id on design_studio_deliverables (booking_id);

-- ----------------------------------------------------------------------------
-- Storage bucket for the finished deliverable files. Private - access goes
-- through the same booking-ownership check as the table itself, not a
-- guessable public URL. Path convention: {booking_id}/{uuid}.{ext}
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('design-studio-files', 'design-studio-files', false, 15728640)
on conflict (id) do update set file_size_limit = 15728640;

drop policy if exists "booking owner or admin can view design studio files" on storage.objects;
drop policy if exists "only admin can upload design studio files" on storage.objects;

create policy "booking owner or admin can view design studio files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'design-studio-files'
    and (
      exists (
        select 1 from design_studio_bookings b
        where b.id::text = (storage.foldername(name))[1] and b.user_id = auth.uid()
      )
      or current_user_is_admin()
    )
  );

create policy "only admin can upload design studio files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'design-studio-files' and current_user_is_admin());
