-- ============================================================================
-- Run this ONCE, after you've signed up for your own ADRITH account through
-- the normal /signup page.
--
-- This is the only way the very first admin gets created — by design,
-- nothing in the app itself can grant is_platform_admin, not even to an
-- existing admin. That's what makes the flag trustworthy: the only path to
-- it is you, directly, in your own database.
--
-- Steps:
--   1. Sign up at /signup with your own email, same as any user would.
--   2. Come back here, replace the email below with the one you just used.
--   3. Run this in the Supabase SQL Editor.
--   4. Log out and back in — your session needs to refresh to pick up the
--      change.
-- ============================================================================

update profiles
set is_platform_admin = true
where id = (
  select id from auth.users where email = 'REPLACE_WITH_YOUR_EMAIL@example.com'
);

-- Confirms it worked — should return exactly one row.
select id, full_name, role, is_platform_admin
from profiles
where is_platform_admin = true;
