-- Run this after 20260902120000_submit_admission_form.sql.
-- Creates a private bucket: applicants cannot list or download other students' photos.

alter table public.identity add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 3145728, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Student photo uploads" on storage.objects;
create policy "Student photo uploads"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'student-photos');

-- Only accepts the exact path created by the browser for that identity record.
create or replace function public.set_identity_photo_path(
  p_identity_id uuid,
  p_photo_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_photo_path <> (p_identity_id::text || '/passport-photo.jpg') then
    raise exception 'Invalid student photo path.' using errcode = '22023';
  end if;

  update public.identity
  set photo_path = p_photo_path
  where identity_id = p_identity_id;

  if not found then
    raise exception 'Admission identity record was not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_identity_photo_path(uuid, text) from public;
grant execute on function public.set_identity_photo_path(uuid, text) to anon, authenticated;
