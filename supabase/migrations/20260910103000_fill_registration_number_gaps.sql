-- Official registration-number allocator for approved admissions.
-- Keeps existing admission.registration_number values unchanged.
-- Every new approved record receives the LOWEST unused KIA<year><4 digits>
-- number. For example, if 0010, 0017, 0020 and 0027 exist, new approvals
-- receive 0001, 0002, 0003 ... and skip those already-used numbers.

create or replace function public.assign_next_admission_registration_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_year text := to_char(current_date, 'YYYY');
  v_suffix integer := 1;
  v_registration_number text;
begin
  -- Serialize assignments so two staff approvals cannot receive the same ID.
  perform pg_advisory_xact_lock(hashtext('kia-admission-registration-number'));

  loop
    v_registration_number := 'KIA' || v_year || lpad(v_suffix::text, 4, '0');
    exit when not exists (
      select 1
      from public.admission
      where registration_number = v_registration_number
    );
    v_suffix := v_suffix + 1;
  end loop;

  new.registration_number := v_registration_number;
  return new;
end;
$$;

drop trigger if exists assign_admission_registration_number on public.admission;
create trigger assign_admission_registration_number
  before insert on public.admission
  for each row
  execute function public.assign_next_admission_registration_number();

-- Read-only check after running this migration:
-- select registration_number from public.admission order by registration_number;
