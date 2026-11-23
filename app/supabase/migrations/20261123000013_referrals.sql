-- Who invited whom through the general "Invite to Chorus" link.
alter table public.profiles add column referred_by uuid references auth.users (id) on delete set null;
alter table public.profiles add column referred_at timestamptz;
