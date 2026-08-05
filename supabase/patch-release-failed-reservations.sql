-- ============================================================================
-- PATCH — Lets a failed AI-analysis attempt release its reservation,
-- instead of permanently costing the person one of their 5 daily
-- generations for something that was never their fault (a bad key, a
-- bug, any system-side failure). Run this once in the Supabase SQL
-- Editor. Already folded into schema.sql. Safe to run multiple times.
--
-- Confirmed directly, not assumed: an owner can release their own
-- failed (still-pending) reservation, and the freed slot genuinely
-- works again right after; an already-completed generation cannot be
-- deleted by anyone, protecting real records; and a stranger cannot
-- delete someone else's reservation to interfere with their limit.
-- ============================================================================

-- Lets a reservation be released when the AI call itself genuinely
-- fails (a bad key, a bug, any system-side failure) - that isn't a real
-- use of the tool and shouldn't cost the person one of their 5 today.
-- Same restriction as completing one: only your own, only while still
-- pending - once a generation is actually done, it can't be deleted.
drop policy if exists "users can release their own pending generation" on isometric_generations;
create policy "users can release their own pending generation"
  on isometric_generations for delete
  to authenticated
  using (user_id = auth.uid() and status = 'pending');
-- Patch complete.
