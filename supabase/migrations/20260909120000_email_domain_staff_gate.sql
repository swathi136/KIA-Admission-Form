-- Email-domain staff gate without Supabase email verification.
-- WARNING: this is a convenience gate, not strong authentication. Anyone who
-- knows an allowed email can impersonate it. Use Supabase Auth before production.

create or replace function public.is_authorized_review_staff(p_staff_email text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_staff_email, ''))) ~ '@kia\.ac\.in$'
      or lower(trim(coalesce(p_staff_email, ''))) = 'swathi.24cs@kct.ac.in';
$$;

create or replace function public.list_pending_admissions(
  p_status text default 'Pending Review',
  p_staff_email text default ''
)
returns table (
  application_id text, status text, submitted_at timestamptz, updated_at timestamptz,
  reviewed_at timestamptz, reviewed_by text, registration_number text,
  form_data jsonb, achievements jsonb
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_authorized_review_staff(p_staff_email) then
    raise exception 'A KIA staff email address is required.' using errcode = '42501';
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
  p_application_id text,
  p_form jsonb,
  p_achievements jsonb default '[]'::jsonb,
  p_staff_email text default ''
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_authorized_review_staff(p_staff_email) then
    raise exception 'A KIA staff email address is required.' using errcode = '42501';
  end if;
  update public.pending_admission_applications
  set form_data = p_form, achievements = coalesce(p_achievements, '[]'::jsonb), updated_at = now()
  where application_id = p_application_id and status = 'Pending Review';
  if not found then
    raise exception 'Pending application was not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.approve_pending_admission(
  p_application_id text,
  p_staff_email text default ''
)
returns table (identity_id uuid, registration_number text)
language plpgsql security definer set search_path = public
as $$
declare
  v_staff_email text := lower(trim(p_staff_email));
  v_form jsonb;
  v_achievements jsonb;
  v_identity_id uuid;
  v_registration_number text;
begin
  if not public.is_authorized_review_staff(v_staff_email) then
    raise exception 'A KIA staff email address is required.' using errcode = '42501';
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

revoke all on function public.list_pending_admissions(text, text) from public;
grant execute on function public.list_pending_admissions(text, text) to anon, authenticated;
revoke all on function public.save_pending_admission(text, jsonb, jsonb, text) from public;
grant execute on function public.save_pending_admission(text, jsonb, jsonb, text) to anon, authenticated;
revoke all on function public.approve_pending_admission(text, text) from public;
grant execute on function public.approve_pending_admission(text, text) to anon, authenticated;
