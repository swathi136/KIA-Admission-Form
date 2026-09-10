-- Adds already-created authorized Supabase Auth users to the staff registry.
-- This fixes accounts made during earlier testing before staff_accounts existed.

insert into public.staff_accounts (user_id, email, created_at, last_sign_in_at, is_active)
select
  u.id,
  lower(u.email),
  coalesce(u.created_at, now()),
  u.last_sign_in_at,
  true
from auth.users u
where lower(coalesce(u.email, '')) ~ '@kia\.ac\.in$'
   or lower(coalesce(u.email, '')) = 'swathi.24cs@kct.ac.in'
on conflict (user_id) do update
  set email = excluded.email,
      last_sign_in_at = coalesce(excluded.last_sign_in_at, public.staff_accounts.last_sign_in_at),
      is_active = true;
