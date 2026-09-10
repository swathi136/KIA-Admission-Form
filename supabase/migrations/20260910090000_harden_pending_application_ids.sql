-- Prevents a pending application submission from failing if the application-ID
-- sequence was reset or fell behind records already in the database.

select setval(
  'public.pending_admission_application_sequence',
  greatest(
    coalesce((
      select max(nullif(substring(application_id from '([0-9]+)$'), '')::bigint)
      from public.pending_admission_applications
      where application_id like 'KIA-%-APP-%'
    ), 0),
    1
  ),
  true
);

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

  -- A sequence is normally unique already. The retry is a safety net for
  -- records imported manually or a sequence that was reset in Supabase.
  loop
    v_application_id := 'KIA-' || to_char(current_date, 'YYYY') || '-APP-'
      || lpad(nextval('public.pending_admission_application_sequence')::text, 4, '0');
    begin
      insert into public.pending_admission_applications (
        application_id, form_data, achievements
      ) values (
        v_application_id, p_form, coalesce(p_achievements, '[]'::jsonb)
      ) returning pending_admission_applications.submitted_at into v_submitted_at;
      exit;
    exception when unique_violation then
      -- Generate the next KIA application ID and try again.
    end;
  end loop;

  return query select v_application_id, v_submitted_at;
end;
$$;
