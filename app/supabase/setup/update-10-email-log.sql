-- Chorus update: record what happened to each reminder email. Run once in Supabase > SQL Editor.

-- Record what happened to each notification's email, so delivery problems
-- can be checked any time (pg_net only keeps function responses for hours).
--   email_status: sent | failed | has_push | email_off | no_address | no_api_key
alter table public.notifications add column email_status text;
alter table public.notifications add column email_error text;
alter table public.notifications add column emailed_at timestamptz;
