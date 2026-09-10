-- Shared official registration-number flow.
-- A number is reserved as soon as a student submits a pending application.
-- It checks BOTH approved admission records and pending applications, then
-- assigns the lowest unused KIA<year><4 digits> number.
-- Existing records are never renumbered.

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
  -- Ensures simultaneous submissions cannot receive the same number.
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

-- Backfill existing pending rows that were submitted before this workflow.
-- Approved records retain their existing admission.registration_number values.
do $$
declare
  v_pending_id uuid;
begin
  for v_pending_id in
    select id
    from public.pending_admission_applications
    where registration_number is null
    order by submitted_at, id
  loop
    update public.pending_admission_applications
    set registration_number = public.next_available_admission_registration_number(),
        updated_at = now()
    where id = v_pending_id;
  end loop;
end;
$$;

-- Reserve the official registration number immediately at student submission.
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
  v_registration_number text;
  v_submitted_at timestamptz;
begin
  if coalesce(trim(p_form ->> 'studentName'), '') = ''
     or coalesce(trim(p_form ->> 'dob'), '') = ''
     or coalesce(trim(p_form ->> 'tnauNumber'), '') = '' then
    raise exception 'Student name, date of birth, and TNAU allotment number are required.'
      using errcode = '22023';
  end if;

  v_registration_number := public.next_available_admission_registration_number();

  loop
    v_application_id := 'KIA-' || to_char(current_date, 'YYYY') || '-APP-'
      || lpad(nextval('public.pending_admission_application_sequence')::text, 4, '0');
    begin
      insert into public.pending_admission_applications (
        application_id, registration_number, form_data, achievements
      ) values (
        v_application_id, v_registration_number, p_form,
        coalesce(p_achievements, '[]'::jsonb)
      ) returning pending_admission_applications.submitted_at into v_submitted_at;
      exit;
    exception when unique_violation then
      -- Application ID collision only: retry with the next application ID.
    end;
  end loop;

  return query select v_application_id, v_submitted_at;
end;
$$;

-- Keep the reserved pending number when staff approves the application.
create or replace function public.approve_pending_admission(p_application_id text)
returns table (identity_id uuid, registration_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_form jsonb;
  v_achievements jsonb;
  v_pending_registration_number text;
  v_identity_id uuid;
begin
  if not public.is_authorized_review_staff() then
    raise exception 'Only an authenticated KIA staff account or the authorized test account can approve applications.' using errcode = '42501';
  end if;

  select form_data, achievements, registration_number
  into v_form, v_achievements, v_pending_registration_number
  from public.pending_admission_applications
  where application_id = p_application_id and status = 'Pending Review'
  for update;

  if not found then
    raise exception 'Pending application was not found or has already been approved.' using errcode = 'P0002';
  end if;

  if v_pending_registration_number is null then
    v_pending_registration_number := public.next_available_admission_registration_number();
  end if;

  select s.identity_id into v_identity_id
  from public.submit_admission(v_form, v_achievements) s;

  -- submit_admission may use its older sequence internally; replace that
  -- temporary value with the number reserved at this student's submission.
  update public.admission
  set registration_number = v_pending_registration_number
  where identity_id = v_identity_id;

  update public.pending_admission_applications
  set status = 'Approved',
      reviewed_at = now(),
      reviewed_by = v_staff_email,
      official_identity_id = v_identity_id,
      registration_number = v_pending_registration_number,
      updated_at = now()
  where application_id = p_application_id;

  return query select v_identity_id, v_pending_registration_number;
end;
$$;

revoke all on function public.next_available_admission_registration_number() from public;
revoke all on function public.submit_pending_admission(jsonb, jsonb) from public;
grant execute on function public.submit_pending_admission(jsonb, jsonb) to anon, authenticated;
revoke all on function public.approve_pending_admission(text) from public;
grant execute on function public.approve_pending_admission(text) to authenticated;
