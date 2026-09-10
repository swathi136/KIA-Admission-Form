-- KIA admission review workflow.
-- Run this after 20260902120000_submit_admission_form.sql in the Supabase SQL Editor.
-- Student submissions are staged here first. Only an authenticated KIA staff
-- member can read, edit, or approve them into the official admission tables.

create table if not exists public.pending_admission_applications (
  id uuid primary key default gen_random_uuid(),
  application_id text not null unique,
  form_data jsonb not null,
  achievements jsonb not null default '[]'::jsonb,
  status text not null default 'Pending Review'
    check (status in ('Pending Review', 'Approved')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  official_identity_id uuid,
  registration_number text
);

alter table public.pending_admission_applications enable row level security;
revoke all on public.pending_admission_applications from anon, authenticated;

create or replace function public.submit_pending_admission(
  p_form jsonb,
  p_achievements jsonb default '[]'::jsonb
)
returns table (application_id text, submitted_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application_id text;
  v_submitted_at timestamptz;
begin
  if coalesce(trim(p_form ->> 'studentName'), '') = ''
     or coalesce(trim(p_form ->> 'dob'), '') = ''
     or coalesce(trim(p_form ->> 'tnauNumber'), '') = '' then
    raise exception 'Student name, date of birth, and TNAU allotment number are required.'
      using errcode = '22023';
  end if;

  v_application_id := 'APP-' || to_char(current_timestamp, 'YYYY') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.pending_admission_applications (
    application_id, form_data, achievements
  ) values (
    v_application_id, p_form, coalesce(p_achievements, '[]'::jsonb)
  ) returning pending_admission_applications.submitted_at into v_submitted_at;

  return query select v_application_id, v_submitted_at;
end;
$$;

create or replace function public.list_pending_admissions(p_status text default 'Pending Review')
returns table (
  application_id text,
  status text,
  submitted_at timestamptz,
  updated_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  registration_number text,
  form_data jsonb,
  achievements jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email !~ '@kia\.ac\.in$' then
    raise exception 'Only authenticated KIA staff can access applications.' using errcode = '42501';
  end if;

  return query
  select p.application_id, p.status, p.submitted_at, p.updated_at,
    p.reviewed_at, p.reviewed_by, p.registration_number, p.form_data, p.achievements
  from public.pending_admission_applications p
  where p.status = p_status
  order by p.submitted_at desc;
end;
$$;

create or replace function public.save_pending_admission(
  p_application_id text,
  p_form jsonb,
  p_achievements jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email !~ '@kia\.ac\.in$' then
    raise exception 'Only authenticated KIA staff can edit applications.' using errcode = '42501';
  end if;

  update public.pending_admission_applications
  set form_data = p_form,
      achievements = coalesce(p_achievements, '[]'::jsonb),
      updated_at = now()
  where application_id = p_application_id
    and status = 'Pending Review';

  if not found then
    raise exception 'Pending application was not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.approve_pending_admission(p_application_id text)
returns table (identity_id uuid, registration_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_form jsonb;
  v_achievements jsonb;
  v_identity_id uuid;
  v_registration_number text;
begin
  if v_email !~ '@kia\.ac\.in$' then
    raise exception 'Only authenticated KIA staff can approve applications.' using errcode = '42501';
  end if;

  select form_data, achievements into v_form, v_achievements
  from public.pending_admission_applications
  where application_id = p_application_id
    and status = 'Pending Review'
  for update;

  if not found then
    raise exception 'Pending application was not found or has already been approved.' using errcode = 'P0002';
  end if;

  select s.identity_id, s.registration_number into v_identity_id, v_registration_number
  from public.submit_admission(v_form, v_achievements) s;

  update public.pending_admission_applications
  set status = 'Approved',
      reviewed_at = now(),
      reviewed_by = v_email,
      official_identity_id = v_identity_id,
      registration_number = v_registration_number,
      updated_at = now()
  where application_id = p_application_id;

  return query select v_identity_id, v_registration_number;
end;
$$;

revoke all on function public.submit_pending_admission(jsonb, jsonb) from public;
grant execute on function public.submit_pending_admission(jsonb, jsonb) to anon, authenticated;
revoke all on function public.list_pending_admissions(text) from public;
grant execute on function public.list_pending_admissions(text) to authenticated;
revoke all on function public.save_pending_admission(text, jsonb, jsonb) from public;
grant execute on function public.save_pending_admission(text, jsonb, jsonb) to authenticated;
revoke all on function public.approve_pending_admission(text) from public;
grant execute on function public.approve_pending_admission(text) to authenticated;
