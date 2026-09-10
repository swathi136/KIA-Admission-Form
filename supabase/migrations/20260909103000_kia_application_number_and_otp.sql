-- Run this after 20260909090000_staff_review_workflow.sql.
-- Makes pending IDs sequential and recognisably KIA-formatted.

create sequence if not exists public.pending_admission_application_sequence start with 1;

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

  v_application_id := 'KIA-' || to_char(current_date, 'YYYY') || '-APP-'
    || lpad(nextval('public.pending_admission_application_sequence')::text, 4, '0');

  insert into public.pending_admission_applications (
    application_id, form_data, achievements
  ) values (
    v_application_id, p_form, coalesce(p_achievements, '[]'::jsonb)
  ) returning pending_admission_applications.submitted_at into v_submitted_at;

  return query select v_application_id, v_submitted_at;
end;
$$;
