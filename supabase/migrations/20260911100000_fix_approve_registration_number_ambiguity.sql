-- Fix SQLSTATE 42702 during staff approval.
-- The function's RETURNS TABLE field named registration_number conflicts with
-- the column of the same name unless the pending-applications table is aliased.

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

  select p.form_data, p.achievements, p.registration_number
  into v_form, v_achievements, v_pending_registration_number
  from public.pending_admission_applications as p
  where p.application_id = p_application_id and p.status = 'Pending Review'
  for update;

  if not found then
    raise exception 'Pending application was not found or has already been approved.' using errcode = 'P0002';
  end if;

  if v_pending_registration_number is null then
    v_pending_registration_number := public.next_available_admission_registration_number();
  end if;

  select s.identity_id into v_identity_id
  from public.submit_admission(v_form, v_achievements) as s;

  update public.admission as a
  set registration_number = v_pending_registration_number
  where a.identity_id = v_identity_id;

  update public.pending_admission_applications as p
  set status = 'Approved',
      reviewed_at = now(),
      reviewed_by = v_staff_email,
      official_identity_id = v_identity_id,
      registration_number = v_pending_registration_number,
      updated_at = now()
  where p.application_id = p_application_id;

  return query select v_identity_id, v_pending_registration_number;
end;
$$;

revoke all on function public.approve_pending_admission(text) from public;
grant execute on function public.approve_pending_admission(text) to authenticated;
