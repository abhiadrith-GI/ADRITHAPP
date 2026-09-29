-- ============================================================================
-- PATCH — Server-side lockdown of the two AI-cost ledgers (Trust Reports and
-- Material Analysis). Run ONLY AFTER SUPABASE_SERVICE_ROLE_KEY has been added to
-- Netlify's environment variables AND the matching code is deployed (the deployed
-- routes then complete and release reservations with that key). Safe to re-run.
--
-- Two gaps, both confirmed by exploit, both fixable only by taking the write path
-- away from the signed-in user:
--
-- 1. FORGED REPORTS. A report's text was written by the user's own session, so a
--    project member could skip the AI entirely and write any text they liked into
--    their own report - which can then be shared by public link. That defeats the
--    point of a tool called "Trust Reports".
--
-- 2. FREEING A SLOT MID-CALL. A user can delete their own pending reservation (the
--    "release on failure" feature). A script can do it deliberately while the AI
--    call is still running, freeing the slot again - the daily cap on AI spend
--    stops being a cap. Same for the material-analysis ledger.
--
-- After this patch only the server (service role, which bypasses RLS) can complete
-- or release a reservation. Users can still RESERVE a slot (insert) exactly as
-- before, which is what enforces the daily caps.
-- ============================================================================
drop policy if exists "generating user can complete or release their own pending report" on trust_reports;
drop policy if exists "generating user can release their own pending report" on trust_reports;

drop policy if exists "users can complete their own pending analysis attempt" on material_analysis_attempts;
drop policy if exists "users can release their own pending analysis attempt" on material_analysis_attempts;
