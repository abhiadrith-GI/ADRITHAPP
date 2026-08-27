
-- ============================================================================
-- HOMECARE: FINISHED HOUSE SERVICES (third and final planned HomeCare base
-- - Construction Labour Services was dropped from the roadmap entirely).
--
-- Genuinely simpler data shape than either materials base: no catalog, no
-- fixed pricing, no line items. Every request gets its own one-off quote
-- after Abhinandan actually looks at what's needed, so this is one table,
-- not three - there's no "order + line items" structure because there's
-- nothing to itemize.
--
-- Status lifecycle:
--   enquired         - customer described the issue, no price yet
--   quoted           - admin reviewed and set a price (and optionally a
--                      schedule) - customer hasn't agreed yet
--   awaiting_payment - customer approved the quote (this one action both
--                      confirms and unlocks payment - no separate approve-
--                      then-pay split, unlike materials' adjustment flow)
--   paid             - marked by the admin for now, no gateway yet, same
--                      as both materials bases
--   complete         - closed out with a text completion report (no
--                      photos - explicitly decided against)
--   cancelled        - stopped at any point (declined quote, etc.)
-- ============================================================================

create table finished_house_service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id),
  service_type text not null check (
    service_type in ('plumbing', 'electrical', 'waterproofing', 'painting', 'masonry_plaster', 'carpentry', 'pest_control', 'deep_cleaning')
  ),
  description text not null,
  property_address text not null,
  status text not null default 'enquired' check (
    status in ('enquired', 'quoted', 'awaiting_payment', 'paid', 'complete', 'cancelled')
  ),
  quoted_price numeric(10, 2),
  scheduled_date timestamptz,
  admin_note text,
  completion_report text,
  created_at timestamptz not null default now(),
  quoted_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz
);

alter table finished_house_service_requests enable row level security;

drop policy if exists "users can view their own service requests" on finished_house_service_requests;
drop policy if exists "users can create their own service requests" on finished_house_service_requests;
drop policy if exists "users can approve their own quoted service request" on finished_house_service_requests;
drop policy if exists "only admin can quote and update service requests" on finished_house_service_requests;

create policy "users can view their own service requests"
  on finished_house_service_requests for select
  to authenticated
  using (user_id = auth.uid() or current_user_is_admin());

create policy "users can create their own service requests"
  on finished_house_service_requests for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'enquired');

-- The one thing a customer can do without being admin: approve a quote,
-- which both confirms the work and reveals payment - no separate steps.
create policy "users can approve their own quoted service request"
  on finished_house_service_requests for update
  to authenticated
  using (user_id = auth.uid() and status = 'quoted')
  with check (user_id = auth.uid() and status = 'awaiting_payment');

create policy "only admin can quote and update service requests"
  on finished_house_service_requests for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

create index if not exists idx_finished_house_service_requests_user_id on finished_house_service_requests (user_id);
