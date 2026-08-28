-- ============================================================================
-- PATCH — Design Studio intake redesign. The original booking form only
-- collected a one-line description; this adds structured, category-
-- specific fields collected at booking time instead of everything
-- happening in a follow-up call. Run once in the Supabase SQL Editor.
-- Already folded into schema.sql for a from-scratch build. Safe to run
-- multiple times.
-- ============================================================================

alter table design_studio_bookings add column if not exists details jsonb not null default '{}'::jsonb;

-- description no longer required to be the ONLY thing collected, but
-- stays not-null - the new forms always send at least an empty string
-- for it now that it's "anything else" rather than the primary field.

-- Patch complete.
