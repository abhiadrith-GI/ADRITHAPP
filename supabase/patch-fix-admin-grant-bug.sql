-- ============================================================================
-- URGENT PATCH — fixes a real bug that has made it impossible to grant
-- platform-admin status through the Supabase SQL Editor since the
-- beginning of this project.
--
-- The bug: the trigger protecting is_platform_admin specifically required
-- a "service_role" credential to change it - but the SQL Editor (the only
-- documented, practical way to bootstrap the very first admin) never
-- carries that credential either. So every attempt to grant admin status
-- this way was silently reverted, no matter how correctly the grant
-- script was run. A related, subtler issue meant role and
-- license_verified were actually passing through UNPROTECTED in that
-- same SQL Editor context, due to a NULL-handling gap - confirmed
-- directly: is_platform_admin stayed false while license_verified
-- incorrectly succeeded, in a real, reproduced test matching the exact
-- scenario.
--
-- The fix: distinguishes "direct database access, no JWT at all" (the
-- SQL Editor, or any other direct connection - the legitimate
-- bootstrapping path) from "a real authenticated app user" (which always
-- carries a JWT). Direct access can grant these fields, matching how
-- admin has to be bootstrapped in the first place. A real app user
-- without existing admin status still cannot change any of them - tested
-- directly, not assumed: an existing admin was successfully created
-- through direct access, and a separate regular authenticated user was
-- confirmed still blocked from self-granting anything.
--
-- Run this once in the Supabase SQL Editor. Safe to run against a live
-- database - only replaces this one function, touches no existing rows.
-- ============================================================================

create or replace function lock_privileged_profile_fields()
returns trigger as $$
declare
  requester_is_admin boolean;
  has_jwt_context boolean;
begin
  -- Direct database access (the Supabase SQL Editor, or any other direct
  -- connection) never carries a JWT at all - no request.jwt.claims, no
  -- auth.uid(). That's deliberately the one path allowed to grant these
  -- fields, since it's exactly how the very first admin has to be
  -- bootstrapped - nothing in the app itself can grant admin status, by
  -- design (see make-me-admin.sql). A request arriving WITH a JWT is a
  -- real, authenticated app user; for that path, only an existing admin
  -- can change these fields, never a regular user granting themselves
  -- anything.
  --
  -- coalesce()'d on both checks below so a missing/null value is treated
  -- as "not admin" / "no JWT" (fail closed) rather than silently passing
  -- through via SQL's three-valued NULL logic (fail open). An earlier
  -- version of this function coalesced the service-role check but not
  -- this one - which is exactly why, when run from the SQL Editor,
  -- license_verified and role were slipping through unprotected while
  -- is_platform_admin stayed correctly blocked: requester_is_admin came
  -- back NULL (auth.uid() matches no row outside a real session), and
  -- "if not NULL" silently skips the whole block instead of enforcing it.
  has_jwt_context := coalesce(auth.jwt(), '{}'::jsonb) != '{}'::jsonb;

  select coalesce(is_platform_admin, false) into requester_is_admin
  from profiles where id = auth.uid();
  requester_is_admin := coalesce(requester_is_admin, false);

  if has_jwt_context and not requester_is_admin then
    new.role := old.role;
    new.is_platform_admin := old.is_platform_admin;
    new.license_verified := old.license_verified;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists lock_privileged_profile_fields_trigger on profiles;

create trigger lock_privileged_profile_fields_trigger
  before update on profiles
  for each row execute function lock_privileged_profile_fields();

-- Patch complete.
