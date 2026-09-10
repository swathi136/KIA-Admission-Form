-- Run AFTER 20260910103000_fill_registration_number_gaps.sql.
-- Registration numbers for approved admissions must avoid number slots already
-- used in either place:
--   1. public.admission.registration_number (approved official records)
--   2. public.pending_admission_applications.application_id or registration_number
--      (applications still awaiting staff approval)
--
-- Example: if pending IDs include KIA-2026-APP-0002 and KIA-2026-APP-0003,
-- new official registrations use 0001, then 0004, 0005, and so on.

create or replace function public.assign_next_admission_registration_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_year text := to_char(current_date, 'YYYY');
  v_suffix integer := 1;
  v_registration_number text;
  v_pending_application_id text;
begin
  -- Prevent concurrent approvals from receiving the same number.
  perform pg_advisory_xact_lock(hashtext('kia-admission-registration-number'));

  loop
    v_registration_number := 'KIA' || v_year || lpad(v_suffix::text, 4, '0');
    v_pending_application_id := 'KIA-' || v_year || '-APP-' || lpad(v_suffix::text, 4, '0');

    exit when not exists (
      select 1
      from public.admission
      where registration_number = v_registration_number
    )
    and not exists (
      select 1
      from public.pending_admission_applications
      where application_id = v_pending_application_id
         or registration_number = v_registration_number
    );

    v_suffix := v_suffix + 1;
  end loop;

  new.registration_number := v_registration_number;
  return new;
end;
$$;
