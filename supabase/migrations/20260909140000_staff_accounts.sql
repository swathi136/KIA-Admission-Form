-- Staff account registry. Run after 20260909130000_verified_staff_password_access.sql.
-- An allowed staff account is added automatically whenever a user registers
-- through Supabase Auth. This table is for audit/reference only; passwords
-- remain securely managed by Supabase Auth and are never stored here.

create table if not exists public.staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  is_active boolean not null default true
);

alter table public.staff_accounts enable row level security;
revoke all on public.staff_accounts from anon, authenticated;

create or replace function public.register_allowed_staff_account()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
begin
  if v_email !~ '@kia\.ac\.in$'
     and v_email <> 'swathi.24cs@kct.ac.in' then
    raise exception 'Only KIA staff email addresses can create staff accounts.' using errcode = '42501';
  end if;

  insert into public.staff_accounts (user_id, email, last_sign_in_at)
  values (new.id, v_email, coalesce(new.last_sign_in_at, now()))
  on conflict (user_id) do update
    set email = excluded.email,
        last_sign_in_at = excluded.last_sign_in_at;
  return new;
end;
$$;

drop trigger if exists on_auth_staff_account_created on auth.users;
create trigger on_auth_staff_account_created
  after insert on auth.users
  for each row execute function public.register_allowed_staff_account();

-- Optional admin-only reference query:
-- select email, created_at, last_sign_in_at, is_active
-- from public.staff_accounts order by created_at desc;
