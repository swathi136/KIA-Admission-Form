-- Removes obsolete staff-RPC overloads left by the earlier email-only gate.
-- Keep the current authenticated functions with these signatures:
-- list_pending_admissions(text)
-- save_pending_admission(text, jsonb, jsonb)
-- approve_pending_admission(text)

drop function if exists public.list_pending_admissions(text, text);
drop function if exists public.save_pending_admission(text, jsonb, jsonb, text);
drop function if exists public.approve_pending_admission(text, text);
drop function if exists public.is_authorized_review_staff(text);
