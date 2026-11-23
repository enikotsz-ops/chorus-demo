-- "Your impact" on the You tab: how many people joined through my invite
-- link. Profiles of people outside my circles aren't readable, so count
-- them server-side. (Repeats the referral columns in case update 11 wasn't run.)
alter table public.profiles add column if not exists referred_by uuid references auth.users (id) on delete set null;
alter table public.profiles add column if not exists referred_at timestamptz;

create or replace function public.my_invite_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from profiles where referred_by = auth.uid()
$$;
revoke execute on function public.my_invite_count() from public, anon;
grant execute on function public.my_invite_count() to authenticated;
