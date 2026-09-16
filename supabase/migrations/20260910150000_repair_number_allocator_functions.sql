-- ONE-TIME REPAIR FOR "next_available_pending_application_id() does not exist".
-- Run this file in Supabase SQL Editor. It is self-contained and safely
-- recreates every function required by the current student submission flow.

create or replace function public.next_available_pending_application_id()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(current_date, 'YYYY');
  v_suffix integer := 1;
  v_application_id text;
begin
  perform pg_advisory_xact_lock(hashtext('kia-pending-application-id'));
  loop
    v_application_id := 'KIA-' || v_year || '-APP-' || lpad(v_suffix::text, 4, '0');
    exit when not exists (
      select 1 from public.pending_admission_applications
      where application_id = v_application_id
    );
    v_suffix := v_suffix + 1;
  end loop;
  return v_application_id;
end;
$$;

create or replace function public.next_available_admission_registration_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(current_date, 'YYYY');
  v_suffix integer := 1;
  v_registration_number text;
begin
  perform pg_advisory_xact_lock(hashtext('kia-admission-registration-number'));
  loop
    v_registration_number := 'KIA' || v_year || lpad(v_suffix::text, 4, '0');
    exit when not exists (
      select 1 from public.admission
      where registration_number = v_registration_number
    ) and not exists (
      select 1 from public.pending_admission_applications
      where registration_number = v_registration_number
    );
    v_suffix := v_suffix + 1;
  end loop;
  return v_registration_number;
end;
$$;

create or replace function public.submit_pending_admission_with_registration(
  p_form jsonb,
  p_achievements jsonb default '[]'::jsonb
)
returns table (
  application_id text,
  registration_number text,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application_id text;
  v_registration_number text;
  v_submitted_at timestamptz;
  v_admission_type text;
  v_tnau_number text;
begin
  v_admission_type := lower(trim(coalesce(p_form ->> 'admissionType', '')));
  v_tnau_number := trim(coalesce(p_form ->> 'tnauNumber', ''));

  if coalesce(trim(p_form ->> 'studentName'), '') = ''
     or coalesce(trim(p_form ->> 'dob'), '') = '' then
    raise exception 'Student name and date of birth are required.'
      using errcode = '22023';
  end if;

  if v_admission_type not in ('counselling', 'management') then
    raise exception 'Admission type must be Counselling or Management.' using errcode = '22023';
  end if;

  if (v_admission_type = 'counselling' and v_tnau_number !~ '^[0-9]{12}$')
     or (v_admission_type = 'management' and v_tnau_number <> '' and v_tnau_number !~ '^[0-9]{12}$') then
    raise exception 'TNAU allotment number is required for Counselling and must contain exactly 12 digits when provided.' using errcode = '22023';
  end if;

  v_application_id := public.next_available_pending_application_id();
  v_registration_number := public.next_available_admission_registration_number();

  insert into public.pending_admission_applications (
    application_id, registration_number, form_data, achievements
  ) values (
    v_application_id, v_registration_number, p_form,
    coalesce(p_achievements, '[]'::jsonb)
  ) returning pending_admission_applications.submitted_at into v_submitted_at;

  return query select v_application_id, v_registration_number, v_submitted_at;
end;
$$;

revoke all on function public.next_available_pending_application_id() from public;
revoke all on function public.next_available_admission_registration_number() from public;
revoke all on function public.submit_pending_admission_with_registration(jsonb, jsonb) from public;
grant execute on function public.submit_pending_admission_with_registration(jsonb, jsonb) to anon, authenticated;
