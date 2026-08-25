-- ============================================================================
-- PATCH — Remove the Isometric View tool's database objects entirely.
-- Run this once in the Supabase SQL Editor. Safe to run multiple times
-- (every drop below is guarded with IF EXISTS).
--
-- Companion to the code removal: the dashboard tool card, both page
-- routes, the three lib files, and the two API routes are already gone
-- from the codebase. This is the database side of the same removal.
--
-- Drops, in dependency order: the trigger first (depends on the
-- function and table), then both functions, then the table itself
-- (which cascades its own policies), then the storage RLS policies for
-- isometric-files. The bucket itself needs a separate manual step - see
-- the note at the bottom.
-- ============================================================================

drop trigger if exists enforce_isometric_generation_limit_trigger on isometric_generations;
drop function if exists enforce_isometric_generation_limit();
drop function if exists isometric_generations_remaining_today(uuid, text);
drop table if exists isometric_generations;

-- Storage: this project has Supabase's storage.protect_delete() guard
-- active, which blocks direct SQL DELETE on storage.objects/buckets
-- entirely (confirmed by testing this exact patch - error 42501,
-- "Use the Storage API instead"). That's Supabase's own safety net
-- against orphaned files, not something to work around in SQL - so
-- this only drops the RLS policies here; removing the bucket itself
-- (and anything ever uploaded to it) is a two-minute manual step,
-- see the note at the bottom of this file.
drop policy if exists "users can view their own isometric files" on storage.objects;
drop policy if exists "users can upload their own isometric files" on storage.objects;

-- Patch complete (database objects). For the storage bucket itself:
-- Supabase Dashboard -> Storage -> select "isometric-files" -> Delete
-- bucket. This uses the real Storage API under the hood, which is
-- exactly what the guard above wants used instead of raw SQL. Since
-- no code anywhere still writes to this bucket, it's not urgent -
-- worth doing for tidiness, not because anything's at risk by leaving
-- it a while longer.
