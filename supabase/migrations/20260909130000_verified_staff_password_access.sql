-- Restores verified Supabase Auth access for staff dashboard operations.
-- Staff must be signed in with a confirmed email/password account.

drop function if exists public.list_pending_admissions(text, text);
drop function if exists public.save_pending_admission(text, jsonb, jsonb, text);
drop function if exists public.approve_pending_admission(text, text);
drop function if exists public.is_authorized_review_staff(text);

create or replace function public.is_authorized_review_staff()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) ~ '@kia\.ac\.in$'
      or lower(coalesce(auth.jwt() ->> 'email', '')) = 'swathi.24cs@kct.ac.in';
$$;

create or replace function public.list_pending_admissions(p_status text default 'Pending Review')
returns table (
  application_id text, status text, submitted_at timestamptz, updated_at timestamptz,
  reviewed_at timestamptz, reviewed_by text, registration_number text,
  form_data jsonb, achievements jsonb
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_authorized_review_staff() then
    raise exception 'Only authenticated KIA staff can access applications.' using errcode = '42501';
  end if;
  return query
  select p.application_id, p.status, p.submitted_at, p.updated_at, p.reviewed_at,
    p.reviewed_by, p.registration_number, p.form_data, p.achievements
  from public.pending_admission_applications p
  where p.status = p_status
  order by p.submitted_at desc;
end;
$$;

create or replace function public.save_pending_admission(
  p_application_id text, p_form jsonb, p_achievements jsonb default '[]'::jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_authorized_review_staff() then
    raise exception 'Only authenticated KIA staff can edit applications.' using errcode = '42501';
  end if;
  update public.pending_admission_applications
  set form_data = p_form, achievements = coalesce(p_achievements, '[]'::jsonb), updated_at = now()
  where application_id = p_application_id and status = 'Pending Review';
  if not found then
    raise exception 'Pending application was not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.approve_pending_admission(p_application_id text)
returns table (identity_id uuid, registration_number text)
language plpgsql security definer set search_path = public
as $$
declare
  v_staff_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_form jsonb;
  v_achievements jsonb;
  v_identity_id uuid;
  v_registration_number text;
begin
  if not public.is_authorized_review_staff() then
    raise exception 'Only authenticated KIA staff can approve applications.' using errcode = '42501';
  end if;
  select form_data, achievements into v_form, v_achievements
  from public.pending_admission_applications
  where application_id = p_application_id and status = 'Pending Review'
  for update;
  if not found then
    raise exception 'Pending application was not found or has already been approved.' using errcode = 'P0002';
  end if;
  select s.identity_id, s.registration_number into v_identity_id, v_registration_number
  from public.submit_admission(v_form, v_achievements) s;
  update public.pending_admission_applications
  set status = 'Approved', reviewed_at = now(), reviewed_by = v_staff_email,
      official_identity_id = v_identity_id, registration_number = v_registration_number,
      updated_at = now()
  where application_id = p_application_id;
  return query select v_identity_id, v_registration_number;
end;
$$;

revoke all on function public.list_pending_admissions(text) from public;
grant execute on function public.list_pending_admissions(text) to authenticated;
revoke all on function public.save_pending_admission(text, jsonb, jsonb) from public;
grant execute on function public.save_pending_admission(text, jsonb, jsonb) to authenticated;
revoke all on function public.approve_pending_admission(text) from public;
grant execute on function public.approve_pending_admission(text) to authenticated;
