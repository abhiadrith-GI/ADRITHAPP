-- ============================================================================
-- URGENT PATCH - fixes signup being completely broken for everyone.
-- Run this once in the Supabase SQL Editor.
--
-- The bug: handle_new_user() (the function that creates a profile the
-- instant someone signs up) referenced the user_role type without saying
-- which schema it lives in. The type has always existed in `public` and
-- was never actually missing - the real problem is that the specific
-- internal connection Supabase's public signup process uses doesn't
-- automatically include `public` in its search path, so Postgres couldn't
-- resolve the plain name and failed with "type user_role does not exist"
-- on every single signup attempt.
--
-- The fix: explicitly say public.user_role instead of just user_role, and
-- pin this function's own search_path so it can't fail this same way
-- again regardless of which connection invokes it. Verified by
-- reproducing the exact failure locally first (restricted search_path,
-- got the identical error), then confirming this exact fix resolves it.
--
-- Safe to run any time: only replaces this one function, touches no data.
-- ============================================================================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'contractor')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Patch complete.
