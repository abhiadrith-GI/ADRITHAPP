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
-- (which cascades its own policies), then the storage objects and
-- bucket for isometric-files.
-- ============================================================================

drop trigger if exists enforce_isometric_generation_limit_trigger on isometric_generations;
drop function if exists enforce_isometric_generation_limit();
drop function if exists isometric_generations_remaining_today(uuid, text);
drop table if exists isometric_generations;

-- Storage: remove any uploaded files first, then the policies, then the
-- bucket itself. Files first because deleting the bucket while it still
-- contains objects can be blocked depending on how the project is
-- configured - doing it in this order avoids that entirely rather than
-- hoping cascade behavior handles it.
delete from storage.objects where bucket_id = 'isometric-files';

drop policy if exists "users can view their own isometric files" on storage.objects;
drop policy if exists "users can upload their own isometric files" on storage.objects;

delete from storage.buckets where id = 'isometric-files';

-- Patch complete.
