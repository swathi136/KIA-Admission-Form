-- ONE-TIME TEST RESET ONLY.
-- Removes the earlier Supabase Auth account for swathi.24cs@kct.ac.in so it
-- can be created again through the Staff Entry screen with a chosen password.
-- Do not run this after creating the new test account.

delete from auth.users
where lower(email) = 'swathi.24cs@kct.ac.in';

-- Verify the reset: this should return no rows before you create the account again.
select id, email, created_at
from auth.users
where lower(email) = 'swathi.24cs@kct.ac.in';
