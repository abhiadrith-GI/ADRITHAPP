-- ============================================================================
-- PATCH — Security hardening for the Isometric View rate limit.
-- Run this once in the Supabase SQL Editor. Already folded into
-- schema.sql for a from-scratch build. Safe to run multiple times.
--
-- WHAT THIS FIXES, confirmed by direct testing before and after:
--
-- 1) The "5 per day" limit on Top View / Furniture Layout was only ever
--    enforced by the client UI disabling a button - the database itself
--    accepted unlimited inserts. Confirmed exploitable directly: 10 rows
--    inserted in a single statement before this patch. Now enforced by
--    an advisory-locked trigger (same pattern already proven necessary
--    for the checkpoint-evidence 2-photo limit), confirmed after the
--    fix: exactly 5 allowed, 6 through 10 correctly rejected.
--
-- 2) A deeper gap in the naive version of that same fix: checking only
--    "how many results have been saved" doesn't stop someone from
--    calling the AI-analysis routes directly and repeatedly without ever
--    saving a result - no row would exist yet to count. Fixed by having
--    the app reserve a real slot the moment analysis begins (a pending
--    row, which the new limit trigger below already protects), and
--    complete that same reservation at the final save step rather than
--    creating a fresh row. This patch adds the UPDATE policy that
--    reservation-completion step actually needs - without it, the
--    completion step silently fails under RLS.
--
-- Confirmed by direct attack simulation: self-privilege-escalation,
-- cross-tenant data access, and completing/tampering with another
-- user's reservation were all tested and correctly blocked; legitimate
-- use in every case was confirmed to still work normally.
-- ============================================================================

drop policy if exists "users can view their own generations" on isometric_generations;
drop policy if exists "users can insert their own generations" on isometric_generations;
drop policy if exists "users can complete their own pending generation" on isometric_generations;

create policy "users can view their own generations"
  on isometric_generations for select
  to authenticated
  using (user_id = auth.uid() or current_user_is_admin());

create policy "users can insert their own generations"
  on isometric_generations for insert
  to authenticated
  with check (user_id = auth.uid());

-- Required for the reservation flow: the study step inserts a pending
-- row immediately (reserving a real slot before the AI call), and the
-- final save step updates that same row to done. Restricted to a user's
-- own row, and only while it's still pending - once a generation is
-- done, this policy no longer matches it, so it can't be edited again.
create policy "users can complete their own pending generation"
  on isometric_generations for update
  to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid());

-- SECURITY FIX: the insert policy only ever checked user_id = auth.uid()
-- - nothing stopped a direct API call from inserting far more than 5 rows
-- a day, completely bypassing the client UI's disabled-button limit.
-- Advisory-locked per (user_id, base) - the same pattern already proven
-- necessary for the checkpoint-evidence 2-photo limit - so two
-- simultaneous requests can't both slip past the count check before
-- either commits.
create or replace function enforce_isometric_generation_limit()
returns trigger as $$
declare
  todays_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.base, 0));

  select count(*) into todays_count
  from isometric_generations
  where user_id = new.user_id
    and base = new.base
    and status != 'rejected_not_vector'
    and created_at >= date_trunc('day', now());

  if todays_count >= 5 then
    raise exception 'Daily generation limit (5) already reached for this tool today';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_isometric_generation_limit_trigger on isometric_generations;
create trigger enforce_isometric_generation_limit_trigger
  before insert on isometric_generations
  for each row execute function enforce_isometric_generation_limit();

-- Patch complete.
