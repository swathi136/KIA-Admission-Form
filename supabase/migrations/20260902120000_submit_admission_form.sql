-- Connects the existing KIA admission tables to the public form.
-- Run this once in the Supabase SQL Editor after the table-creation SQL.

alter table public.identity add column if not exists religion text;
alter table public.contact add column if not exists student_mobile text;
alter table public.admission add column if not exists registration_number text;
alter table public.hostel_admission add column if not exists emergency_contact_name text;
alter table public.hostel_admission add column if not exists declaration_accepted boolean not null default false;

create unique index if not exists admission_registration_number_key
  on public.admission (registration_number)
  where registration_number is not null;

create sequence if not exists public.admission_registration_sequence start with 1;

-- This RPC saves the parent and all related records in one database transaction.
-- The browser can submit applications but cannot read applicants' personal data.
create or replace function public.submit_admission(
  p_form jsonb,
  p_achievements jsonb default '[]'::jsonb
)
returns table (identity_id uuid, registration_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity_id uuid;
  v_registration_number text;
begin
  if coalesce(trim(p_form ->> 'studentName'), '') = ''
     or coalesce(trim(p_form ->> 'dob'), '') = ''
     or coalesce(trim(p_form ->> 'tnauNumber'), '') = '' then
    raise exception 'Student name, date of birth, and TNAU allotment number are required.'
      using errcode = '22023';
  end if;

  v_registration_number := 'KIA' || to_char(current_date, 'YYYY')
    || lpad(nextval('public.admission_registration_sequence')::text, 4, '0');

  insert into public.identity as i (
    student_name, date_of_birth, gender, blood_group, nationality, region,
    religion, community, caste, mother_tongue
  ) values (
    p_form ->> 'studentName', (p_form ->> 'dob')::date, p_form ->> 'gender',
    coalesce(nullif(p_form ->> 'bloodGroupOther', ''), p_form ->> 'bloodGroup'),
    p_form ->> 'nationality', p_form ->> 'religion', p_form ->> 'religion',
    p_form ->> 'community', p_form ->> 'caste', p_form ->> 'motherTongue'
  ) returning i.identity_id into v_identity_id;

  insert into public.admission (
    identity_id, registration_number, tnau_allotment_number, admission_type,
    admission_quota, first_graduate, hostel_accommodation, course_program, academic_year
  ) values (
    v_identity_id, v_registration_number, p_form ->> 'tnauNumber', p_form ->> 'admissionType',
    p_form ->> 'admissionQuota', lower(p_form ->> 'firstGraduate') = 'yes',
    lower(p_form ->> 'hostelStatus') = 'yes', p_form ->> 'course', p_form ->> 'batch'
  );

  insert into public.contact (
    identity_id, student_mobile, student_mobile_whatsapp, email, communication_address,
    permanent_address, district, state, pin_code, emergency_contact_1, emergency_contact_2
  ) values (
    v_identity_id, p_form ->> 'studentMobile', p_form ->> 'whatsapp', p_form ->> 'email',
    p_form ->> 'commAddress', p_form ->> 'permAddress', p_form ->> 'district', p_form ->> 'state',
    p_form ->> 'pincode', p_form ->> 'emergency1', p_form ->> 'emergency2'
  );

  insert into public.class_10_education (
    identity_id, board_10th, school_name_10th, school_address_10th,
    month_year_of_passing, mode_of_instruction, marks_10th
  ) values (
    v_identity_id, p_form ->> 'xBoard', p_form ->> 'xSchool', p_form ->> 'xSchoolAddress',
    p_form ->> 'xPassing', p_form ->> 'xMedium', p_form ->> 'xMarks'
  );

  insert into public.class_12_education (
    identity_id, board_12th, school_name_12th, school_address_12th,
    month_year_of_passing, medium_of_instruction, marks_12th
  ) values (
    v_identity_id, p_form ->> 'xiiBoard', p_form ->> 'xiiSchool', p_form ->> 'xiiSchoolAddress',
    p_form ->> 'xiiPassing', p_form ->> 'xiiMedium', p_form ->> 'xiiMarks'
  );

  insert into public.class_12_subject_marks (
    identity_id, language, english, mathematics, physics, chemistry, biology, botany,
    zoology, computer_science, total_marks, twelfth_cutoff, emis_number
  ) values (
    v_identity_id, p_form ->> 'mLanguage', p_form ->> 'mEnglish', p_form ->> 'mMaths',
    p_form ->> 'mPhysics', p_form ->> 'mChemistry', p_form ->> 'mBiology',
    p_form ->> 'mBotany', p_form ->> 'mZoology', p_form ->> 'mComputerScience',
    p_form ->> 'mTotal', p_form ->> 'xiiCutoff', p_form ->> 'emisNumber'
  );

  insert into public.family (
    identity_id, father_guardian_name, father_qualification, father_occupation,
    father_company_organization, father_email, father_mobile, mother_name,
    mother_qualification, mother_occupation, mother_company_organization,
    mother_email, mother_mobile, annual_family_income
  ) values (
    v_identity_id, p_form ->> 'fatherName', p_form ->> 'fatherQualification',
    p_form ->> 'fatherOccupation', p_form ->> 'fatherCompany', p_form ->> 'fatherEmail',
    p_form ->> 'fatherMobile', p_form ->> 'motherName', p_form ->> 'motherQualification',
    p_form ->> 'motherOccupation', p_form ->> 'motherCompany', p_form ->> 'motherEmail',
    p_form ->> 'motherMobile', p_form ->> 'familyIncome'
  );

  insert into public.school_social_background (
    identity_id, board_of_study, medium_of_study, school_type, studied_tamil_in_12th, family_background
  ) values (
    v_identity_id, p_form ->> 'boardOfStudy', p_form ->> 'mediumOfStudy',
    p_form ->> 'schoolType', p_form ->> 'tamilXii', p_form ->> 'familyBackground'
  );

  insert into public.agriculture_background (
    identity_id, agricultural_land_availability, agricultural_land_area,
    major_crops_planted, agricultural_land_locality, residence_type
  ) values (
    v_identity_id, p_form ->> 'landAvailability', p_form ->> 'landArea',
    p_form ->> 'majorCrops', p_form ->> 'landLocality', p_form ->> 'residenceType'
  );

  insert into public.additional_official_information (
    identity_id, bank_account_holder_name, relationship_with_account_holder,
    bank_name, bank_branch, bank_account_number, bank_ifsc, loan_account_number,
    loan_ifsc, loan_bank_and_branch, passport_number, aadhaar_number
  ) values (
    v_identity_id, p_form ->> 'bankHolder', p_form ->> 'holderRelationship',
    p_form ->> 'bankName', p_form ->> 'bankBranch', p_form ->> 'bankAccount',
    p_form ->> 'bankIfsc', p_form ->> 'loanAccount', p_form ->> 'loanIfsc',
    p_form ->> 'loanBankBranch', p_form ->> 'passportNumber', p_form ->> 'aadhaarNumber'
  );

  insert into public.achievements (
    identity_id, category, activity, achievement_level, achievement_type, description
  )
  select v_identity_id, item ->> 'category', item ->> 'activity', item ->> 'level',
    item ->> 'type', item ->> 'description'
  from jsonb_array_elements(coalesce(p_achievements, '[]'::jsonb)) as item;

  if lower(p_form ->> 'hostelStatus') = 'yes' then
    insert into public.hostel_admission (
      identity_id, course_or_branch, father_mother_number, date_of_birth, blood_group,
      allergy, allergy_details, email_id, mobile_number, correspondence_address,
      correspondence_phone_number, permanent_address, permanent_address_phone_number,
      local_guardian_name, local_guardian_address, local_guardian_phone_number,
      local_guardian_occupation_designation, father_occupation_designation,
      mother_occupation_designation, relative_1_name, relative_1_address,
      relative_1_phone_number, relative_1_relationship, relative_2_name,
      relative_2_address, relative_2_phone_number, relative_2_relationship,
      relative_3_name, relative_3_address, relative_3_phone_number,
      relative_3_relationship, guardian_during_holidays, emergency_contact_name,
      emergency_contact_residence_phone, emergency_contact_office_phone,
      emergency_contact_relationship, declaration_accepted
    ) values (
      v_identity_id, p_form ->> 'hostelCourse', p_form ->> 'hostelParentName',
      nullif(p_form ->> 'hostelDob', '')::date, p_form ->> 'hostelBloodGroup',
      p_form ->> 'hostelMedicineAllergy', p_form ->> 'hostelAllergyDetails',
      p_form ->> 'hostelEmail', p_form ->> 'hostelMobile', p_form ->> 'hostelAddress',
      p_form ->> 'hostelCorrespondencePhone', p_form ->> 'hostelPermanentAddress',
      p_form ->> 'hostelPermanentPhone', p_form ->> 'hostelLocalGuardianName',
      p_form ->> 'hostelLocalGuardianAddress', p_form ->> 'hostelLocalGuardianPhone',
      p_form ->> 'hostelLocalGuardianOccupation', p_form ->> 'hostelFatherOccupation',
      p_form ->> 'hostelMotherOccupation', p_form ->> 'hostelVisitorName_1',
      p_form ->> 'hostelVisitorAddress_1', p_form ->> 'hostelVisitorPhone_1',
      p_form ->> 'hostelVisitorRelation_1', p_form ->> 'hostelVisitorName_2',
      p_form ->> 'hostelVisitorAddress_2', p_form ->> 'hostelVisitorPhone_2',
      p_form ->> 'hostelVisitorRelation_2', p_form ->> 'hostelVisitorName_3',
      p_form ->> 'hostelVisitorAddress_3', p_form ->> 'hostelVisitorPhone_3',
      p_form ->> 'hostelVisitorRelation_3', p_form ->> 'hostelHolidayTravel',
      p_form ->> 'hostelEmergencyName', p_form ->> 'hostelEmergencyResidencePhone',
      p_form ->> 'hostelEmergencyOfficePhone', p_form ->> 'hostelEmergencyRelation',
      coalesce((p_form ->> 'hostelDeclaration')::boolean, false)
    );
  end if;

  return query select v_identity_id, v_registration_number;
end;
$$;

alter table public.identity enable row level security;
alter table public.admission enable row level security;
alter table public.contact enable row level security;
alter table public.class_10_education enable row level security;
alter table public.class_12_education enable row level security;
alter table public.class_12_subject_marks enable row level security;
alter table public.family enable row level security;
alter table public.school_social_background enable row level security;
alter table public.agriculture_background enable row level security;
alter table public.additional_official_information enable row level security;
alter table public.achievements enable row level security;
alter table public.hostel_admission enable row level security;

revoke all on public.identity, public.admission, public.contact, public.class_10_education,
  public.class_12_education, public.class_12_subject_marks, public.family,
  public.school_social_background, public.agriculture_background,
  public.additional_official_information, public.achievements, public.hostel_admission
  from anon, authenticated;
do $$
begin
  if to_regclass('public.hostel_admission_details') is not null then
    revoke all on public.hostel_admission_details from anon, authenticated;
  end if;
end;
$$;
revoke all on function public.submit_admission(jsonb, jsonb) from public;
grant execute on function public.submit_admission(jsonb, jsonb) to anon, authenticated;
