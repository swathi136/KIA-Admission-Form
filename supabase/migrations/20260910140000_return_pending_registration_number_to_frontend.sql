-- Returns the registration number reserved at student submission so the
-- frontend confirmation and student PDF show Registration Number, not the
-- internal Application ID.

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
begin
  if coalesce(trim(p_form ->> 'studentName'), '') = ''
     or coalesce(trim(p_form ->> 'dob'), '') = ''
     or coalesce(trim(p_form ->> 'tnauNumber'), '') = '' then
    raise exception 'Student name, date of birth, and TNAU allotment number are required.'
      using errcode = '22023';
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

revoke all on function public.submit_pending_admission_with_registration(jsonb, jsonb) from public;
grant execute on function public.submit_pending_admission_with_registration(jsonb, jsonb) to anon, authenticated;
