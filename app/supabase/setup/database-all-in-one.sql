-- Chorus database setup. Paste ALL of this into Supabase > SQL Editor > New query, then Run.

-- Chorus: groups answer the same question by voice. Answers stay locked
-- until every participant has answered. Missed deadlines get up to three
-- automatic extensions; after that the round stays locked for good.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid not null references auth.users (id),
  questions_per_week int not null default 1 check (questions_per_week between 1 and 3),
  release_hour int not null default 18 check (release_hour between 0 and 23),
  timezone text not null default 'Europe/London',
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  next_release_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.questions (
  id serial primary key,
  theme text not null,
  text text not null unique
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  question_id int not null references public.questions (id),
  opens_at timestamptz not null default now(),
  base_deadline timestamptz not null,
  deadline timestamptz not null,
  extensions_used int not null default 0 check (extensions_used between 0 and 3),
  status text not null default 'open' check (status in ('open', 'unlocked', 'expired')),
  unlocked_at timestamptz,
  closed_at timestamptz
);
create index rounds_group_idx on public.rounds (group_id, opens_at desc);
create index rounds_open_idx on public.rounds (status) where status = 'open';

-- Who must answer before the round unlocks. Members at open time, plus people
-- who join before anyone has answered (or while the round is still solo).
create table public.round_participants (
  round_id uuid not null references public.rounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (round_id, user_id)
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  duration_ms int not null check (duration_ms > 0 and duration_ms <= 605000),
  created_at timestamptz not null default now(),
  unique (round_id, user_id)
);

create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Outbox drained by the send-push edge function.
create table public.notifications (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notifications_unsent_idx on public.notifications (created_at) where sent_at is null;

-- One evening reminder per person per local day.
create table public.reminder_log (
  round_id uuid not null references public.rounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  primary key (round_id, user_id, local_date)
);

-- "Would you pay £2 to unlock?" interest test. No payment is taken.
create table public.unlock_interest (
  round_id uuid not null references public.rounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

create table public.feedback (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  message text not null check (char_length(message) between 1 and 4000),
  page text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Schedule helpers
-- ---------------------------------------------------------------------------

-- ISO weekdays questions are released on: 1/wk Mon, 2/wk Mon+Thu, 3/wk Mon+Wed+Fri.
create function public.release_days(qpw int) returns int[]
language sql immutable as $$
  select case qpw when 1 then array[1] when 2 then array[1, 4] else array[1, 3, 5] end
$$;

-- First release slot strictly after `after`, in the group's local time.
create function public.next_slot(after timestamptz, qpw int, hour int, tz text)
returns timestamptz
language plpgsql stable as $$
declare
  d date := (after at time zone tz)::date;
  candidate timestamptz;
begin
  for i in 0..8 loop
    if extract(isodow from d + i)::int = any (public.release_days(qpw)) then
      candidate := ((d + i) + make_time(hour, 0, 0)) at time zone tz;
      if candidate > after then
        return candidate;
      end if;
    end if;
  end loop;
  raise exception 'no release slot found';
end
$$;

-- Extension lengths shrink with each use and scale with the question window.
create function public.extension_length(qpw int, n int) returns interval
language sql immutable as $$
  select (case qpw
    when 1 then array[interval '1 day', interval '6 hours', interval '1 hour']
    when 2 then array[interval '12 hours', interval '3 hours', interval '30 minutes']
    else array[interval '8 hours', interval '2 hours', interval '20 minutes']
  end)[n]
$$;

create function public.format_interval(i interval) returns text
language sql immutable as $$
  select case
    when i >= interval '1 day' then extract(day from i)::int || ' day' || case when i >= interval '2 days' then 's' else '' end
    when i >= interval '1 hour' then extract(hour from i)::int || ' hour' || case when i >= interval '2 hours' then 's' else '' end
    else extract(minute from i)::int || ' minutes'
  end
$$;

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so RLS policies don't recurse)
-- ---------------------------------------------------------------------------

create function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid())
$$;

create function public.is_admin(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid() and role = 'admin')
$$;

create function public.round_group(rid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from rounds where id = rid
$$;

create function public.shares_group(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- ---------------------------------------------------------------------------
-- Round lifecycle
-- ---------------------------------------------------------------------------

create function public.notify_users(user_ids uuid[], title text, body text, url text)
returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, title, body, url)
  select u, title, body, url from unnest(user_ids) as u
$$;

-- Random question the group hasn't had recently.
create function public.pick_question(gid uuid, exclude int default null) returns int
language sql volatile security definer set search_path = public as $$
  select q.id from questions q
  where q.id is distinct from exclude
  order by (q.id in (select question_id from rounds where group_id = gid)), random()
  limit 1
$$;

create function public.open_round(gid uuid, deadline_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
  members uuid[];
  gname text;
begin
  insert into rounds (group_id, question_id, base_deadline, deadline)
  values (gid, pick_question(gid), deadline_at, deadline_at)
  returning id into rid;

  insert into round_participants (round_id, user_id)
  select rid, user_id from group_members where group_id = gid;

  select name into gname from groups where id = gid;
  select array_agg(user_id) into members from group_members where group_id = gid;
  perform notify_users(members, gname, 'A new question is waiting for you.', '/r/' || rid);
  return rid;
end
$$;

-- Unlock once every remaining participant has answered.
create function public.check_unlock(rid uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r rounds;
  missing int;
  members uuid[];
begin
  select * into r from rounds where id = rid for update;
  if r.status <> 'open' then
    return false;
  end if;

  select count(*) into missing from round_participants p
  where p.round_id = rid
    and not exists (select 1 from answers a where a.round_id = rid and a.user_id = p.user_id);

  -- A round needs at least two voices before it can unlock.
  if missing > 0 or (select count(*) from round_participants where round_id = rid) < 2 then
    return false;
  end if;

  update rounds set status = 'unlocked', unlocked_at = now(), closed_at = now() where id = rid;
  select array_agg(user_id) into members from round_participants where round_id = rid;
  perform notify_users(members, 'Your round is unlocked', 'Everyone answered. Have a listen.', '/r/' || rid);
  return true;
end
$$;

-- Run every few minutes by pg_cron: releases questions, applies extensions,
-- expires rounds and sends evening reminders.
create function public.chorus_tick() returns void
language plpgsql security definer set search_path = public as $$
declare
  g groups;
  r record;
  slot timestamptz;
  ext interval;
  pending uuid[];
  everyone uuid[];
begin
  -- 1. Scheduled releases
  for g in select * from groups where next_release_at <= now() for update loop
    slot := next_slot(g.next_release_at + interval '1 minute', g.questions_per_week, g.release_hour, g.timezone);
    update groups set next_release_at = slot where id = g.id;
    perform open_round(g.id, slot);
  end loop;

  -- 2. Deadlines: extend up to three times, then lock for good
  for r in
    select rd.*, gr.questions_per_week, gr.name as group_name
    from rounds rd join groups gr on gr.id = rd.group_id
    where rd.status = 'open' and rd.deadline <= now()
    for update of rd
  loop
    select array_agg(p.user_id) into pending from round_participants p
    where p.round_id = r.id
      and not exists (select 1 from answers a where a.round_id = r.id and a.user_id = p.user_id);
    select array_agg(user_id) into everyone from round_participants where round_id = r.id;

    if r.extensions_used < 3 then
      ext := extension_length(r.questions_per_week, r.extensions_used + 1);
      update rounds set deadline = deadline + ext, extensions_used = extensions_used + 1 where id = r.id;
      perform notify_users(pending, r.group_name,
        case r.extensions_used + 1
          when 3 then 'Last chance: ' || format_interval(ext) || ' left before this round locks for good.'
          else 'Extra time: you have ' || format_interval(ext) || ' to record your answer.'
        end,
        '/r/' || r.id);
    else
      update rounds set status = 'expired', closed_at = now() where id = r.id;
      perform notify_users(everyone, r.group_name, 'This round stayed locked. Not everyone answered in time.', '/r/' || r.id);
    end if;
  end loop;

  -- 3. Evening reminders at the group's release hour in each person's own time
  -- zone, during the last two days before the original deadline.
  with due as (
    insert into reminder_log (round_id, user_id, local_date)
    select rd.id, p.user_id, (now() at time zone pr.timezone)::date
    from rounds rd
    join groups gr on gr.id = rd.group_id
    join round_participants p on p.round_id = rd.id
    join profiles pr on pr.id = p.user_id
    where rd.status = 'open'
      and rd.extensions_used = 0
      and rd.deadline - now() between interval '0' and interval '48 hours'
      and rd.opens_at < now() - interval '12 hours'
      and extract(hour from now() at time zone pr.timezone)::int = gr.release_hour
      and not exists (select 1 from answers a where a.round_id = rd.id and a.user_id = p.user_id)
    on conflict do nothing
    returning round_id, user_id
  )
  insert into notifications (user_id, title, body, url)
  select due.user_id, gr.name, 'Everyone is waiting to hear from you.', '/r/' || due.round_id
  from due
  join rounds rd on rd.id = due.round_id
  join groups gr on gr.id = rd.group_id;
end
$$;

-- ---------------------------------------------------------------------------
-- RPCs called by the app
-- ---------------------------------------------------------------------------

create function public.create_group(group_name text, qpw int default 1, hour int default 18, tz text default 'Europe/London')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  first_deadline timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  first_deadline := next_slot(now() + interval '1 day', qpw, hour, tz);

  insert into groups (name, created_by, questions_per_week, release_hour, timezone, next_release_at)
  values (group_name, auth.uid(), qpw, hour, tz, first_deadline)
  returning id into gid;
  insert into group_members (group_id, user_id, role) values (gid, auth.uid(), 'admin');

  -- Start straight away so a new group has something to answer.
  perform open_round(gid, first_deadline);
  return gid;
end
$$;

create function public.group_preview(code text)
returns table (id uuid, name text, member_count bigint)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, (select count(*) from group_members m where m.group_id = g.id)
  from groups g where g.invite_code = code
$$;

create function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select id into gid from groups where invite_code = code;
  if gid is null then
    raise exception 'invite not found';
  end if;
  insert into group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;

  -- Join open rounds nobody has answered yet, or that still have a single
  -- participant; otherwise start with the next question.
  insert into round_participants (round_id, user_id)
  select r.id, auth.uid() from rounds r
  where r.group_id = gid and r.status = 'open'
    and (not exists (select 1 from answers a where a.round_id = r.id)
         or (select count(*) from round_participants p where p.round_id = r.id) < 2)
  on conflict do nothing;
  return gid;
end
$$;

-- Removing someone from open rounds may complete them.
create function public.drop_from_open_rounds(gid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  for rid in
    delete from round_participants p using rounds r
    where p.round_id = r.id and r.group_id = gid and r.status = 'open' and p.user_id = uid
    returning p.round_id
  loop
    perform check_unlock(rid);
  end loop;
end
$$;

create function public.leave_group(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from group_members where group_id = gid and user_id = auth.uid();
  perform drop_from_open_rounds(gid, auth.uid());
  -- Hand admin to the longest-standing member if the last admin left.
  if not exists (select 1 from group_members where group_id = gid and role = 'admin') then
    update group_members set role = 'admin'
    where (group_id, user_id) = (
      select group_id, user_id from group_members where group_id = gid order by joined_at limit 1
    );
  end if;
end
$$;

create function public.remove_member(gid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(gid) then
    raise exception 'only the group admin can remove members';
  end if;
  if uid = auth.uid() then
    raise exception 'use leave_group to leave';
  end if;
  delete from group_members where group_id = gid and user_id = uid;
  perform drop_from_open_rounds(gid, uid);
end
$$;

create function public.update_group_settings(gid uuid, group_name text, qpw int, hour int, tz text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(gid) then
    raise exception 'only the group admin can change settings';
  end if;
  -- Applies to future releases; open rounds keep their deadlines.
  update groups
  set name = group_name, questions_per_week = qpw, release_hour = hour, timezone = tz,
      next_release_at = next_slot(now(), qpw, hour, tz)
  where id = gid;
end
$$;

-- "New question" is only allowed before anyone has answered.
create function public.shuffle_question(rid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r rounds;
  qid int;
begin
  select * into r from rounds where id = rid for update;
  if r is null or not is_member(r.group_id) then
    raise exception 'round not found';
  end if;
  if r.status <> 'open' or exists (select 1 from answers where round_id = rid) then
    raise exception 'the question can only change before the first answer';
  end if;
  qid := pick_question(r.group_id, r.question_id);
  update rounds set question_id = qid where id = rid;
  return qid;
end
$$;

-- Called after the audio file is uploaded to storage.
create function public.submit_answer(rid uuid, path text, mime text, duration int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r rounds;
begin
  select * into r from rounds where id = rid;
  if r is null or r.status <> 'open' then
    raise exception 'this round is closed';
  end if;
  if not exists (select 1 from round_participants where round_id = rid and user_id = auth.uid()) then
    raise exception 'you are not part of this round';
  end if;
  if split_part(path, '/', 1) <> rid::text or split_part(path, '/', 2) <> auth.uid()::text then
    raise exception 'invalid upload path';
  end if;
  insert into answers (round_id, user_id, storage_path, mime_type, duration_ms)
  values (rid, auth.uid(), path, mime, duration);
  return check_unlock(rid);
end
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.questions enable row level security;
alter table public.rounds enable row level security;
alter table public.round_participants enable row level security;
alter table public.answers enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.reminder_log enable row level security;
alter table public.unlock_interest enable row level security;
alter table public.feedback enable row level security;

create policy "own or shared profiles" on public.profiles for select
  using (id = auth.uid() or public.shares_group(id));
create policy "update own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy "members see group" on public.groups for select using (public.is_member(id));
create policy "members see members" on public.group_members for select using (public.is_member(group_id));
create policy "anyone signed in reads questions" on public.questions for select to authenticated using (true);
create policy "members see rounds" on public.rounds for select using (public.is_member(group_id));
create policy "members see participants" on public.round_participants for select
  using (public.is_member(public.round_group(round_id)));

-- Everyone sees who has answered (for "answered · locked"); the audio itself is
-- protected by the storage policy below.
create policy "members see answer status" on public.answers for select
  using (public.is_member(public.round_group(round_id)));

create policy "own push subscriptions" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "record unlock interest" on public.unlock_interest for insert
  with check (user_id = auth.uid() and public.is_member(public.round_group(round_id)));
create policy "see unlock interest" on public.unlock_interest for select
  using (user_id = auth.uid());

create policy "send feedback" on public.feedback for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- New users get a profile row
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lifecycle functions are internal; only the app RPCs are callable by users.
revoke execute on function public.chorus_tick() from public, anon, authenticated;
revoke execute on function public.open_round(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.check_unlock(uuid) from public, anon, authenticated;
revoke execute on function public.notify_users(uuid[], text, text, text) from public, anon, authenticated;
revoke execute on function public.drop_from_open_rounds(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.pick_question(uuid, int) from public, anon, authenticated;

-- Private bucket for voice answers. Files live at {round_id}/{user_id}/{file}.
insert into storage.buckets (id, name, public, file_size_limit)
values ('answers', 'answers', false, 26214400)
on conflict (id) do nothing;

create function public.can_upload_answer(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from rounds r
    join round_participants p on p.round_id = r.id and p.user_id = auth.uid()
    where r.id::text = split_part(object_name, '/', 1)
      and split_part(object_name, '/', 2) = auth.uid()::text
      and r.status = 'open'
      and not exists (select 1 from answers a where a.round_id = r.id and a.user_id = auth.uid())
  )
$$;

-- Audio can only be fetched once the round has unlocked.
create function public.can_listen(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rounds r
    where r.id::text = split_part(object_name, '/', 1)
      and r.status = 'unlocked'
      and is_member(r.group_id)
  )
$$;

create policy "upload own answer" on storage.objects for insert to authenticated
  with check (bucket_id = 'answers' and public.can_upload_answer(name));

create policy "listen once unlocked" on storage.objects for select to authenticated
  using (bucket_id = 'answers' and public.can_listen(name));

-- Starter theme bank. Add more rows any time; groups get unused questions first.
insert into public.questions (theme, text) values
  ('Family history', 'Who in our family history do you wish you''d asked more questions?'),
  ('Family history', 'What''s a family story you''ve heard so often you could tell it yourself?'),
  ('Family history', 'Which relative do people say you take after, and do you agree?'),
  ('Family history', 'What do you know about how your parents or grandparents met?'),
  ('Family history', 'Is there a family recipe, saying or habit you hope never gets lost?'),
  ('Family history', 'What''s an object in your home with a story behind it?'),
  ('Childhood', 'Describe the home you grew up in, room by room if you can.'),
  ('Childhood', 'What did a perfect Saturday look like when you were ten?'),
  ('Childhood', 'Who was your favourite teacher, and why?'),
  ('Childhood', 'What were you scared of as a child that seems funny now?'),
  ('Childhood', 'What did you want to be when you grew up?'),
  ('Childhood', 'What''s a smell or sound that takes you straight back to being a kid?'),
  ('Firsts', 'Tell us about your first job.'),
  ('Firsts', 'What''s the first thing you remember buying with your own money?'),
  ('Firsts', 'Describe the first place you lived away from home.'),
  ('Firsts', 'What was your first real heartbreak, and how did you get through it?'),
  ('Firsts', 'Tell us about the first time you travelled somewhere new.'),
  ('Food & home', 'What meal makes you feel most at home?'),
  ('Food & home', 'Who taught you to cook, or who do you wish had?'),
  ('Food & home', 'What''s the best meal you''ve ever had, and who were you with?'),
  ('Food & home', 'What did special occasions look like at your table growing up?'),
  ('Places', 'Where in the world do you feel most like yourself?'),
  ('Places', 'Describe a place that no longer exists but you still think about.'),
  ('Places', 'If you could go back to one trip, which would it be?'),
  ('Places', 'What''s your favourite walk, and what do you notice on it?'),
  ('Life lessons', 'What''s the best advice you''ve ever been given?'),
  ('Life lessons', 'What do you know now that you wish you''d known at twenty?'),
  ('Life lessons', 'Tell us about a time you changed your mind about something important.'),
  ('Life lessons', 'What''s a mistake you''re glad you made?'),
  ('Life lessons', 'What are you proud of that most people don''t know about?'),
  ('Love & friendship', 'Who is a friend that changed the course of your life?'),
  ('Love & friendship', 'How did you know you loved someone?'),
  ('Love & friendship', 'Tell us about a time someone showed up for you when you needed it.'),
  ('Love & friendship', 'What''s a small kindness from a stranger you''ve never forgotten?'),
  ('Right now', 'What''s been on your mind most this week?'),
  ('Right now', 'What''s something small that made you happy recently?'),
  ('Right now', 'What are you looking forward to this year?'),
  ('Right now', 'What are you learning at the moment?'),
  ('Dreams', 'If money and time didn''t matter, how would you spend next year?'),
  ('Dreams', 'What''s something you still want to try?'),
  ('Dreams', 'What do you hope people remember about you?'),
  ('Dreams', 'What would you like our family to be doing together in ten years?')
on conflict (text) do nothing;

-- Recordings are kept until the person who made them deletes them.
-- People can delete single answers, or their whole account; on account
-- deletion they choose whether their recordings stay with their groups.

-- Answers can outlive the account that recorded them, credited by name.
alter table public.answers add column speaker_name text;
alter table public.answers alter column user_id drop not null;
alter table public.answers drop constraint answers_user_id_fkey;
alter table public.answers
  add constraint answers_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

-- A group outlives its creator.
alter table public.groups alter column created_by drop not null;
alter table public.groups drop constraint groups_created_by_fkey;
alter table public.groups
  add constraint groups_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;

-- People may remove their own audio files ({round_id}/{user_id}/{file}).
create policy "delete own answer files" on storage.objects for delete to authenticated
  using (bucket_id = 'answers' and split_part(name, '/', 2) = auth.uid()::text);

-- Storage paths of all my answers, including groups I've since left.
create function public.my_answer_paths() returns setof text
language sql stable security definer set search_path = public as $$
  select storage_path from answers where user_id = auth.uid()
$$;

-- Called after the app has removed the audio file.
create function public.delete_answer(aid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from answers where id = aid and user_id = auth.uid();
  if not found then
    raise exception 'answer not found';
  end if;
end
$$;

-- keep_recordings = false: the app has already removed my audio files.
create function public.delete_my_account(keep_recordings boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  if keep_recordings then
    update answers a
    set speaker_name = coalesce((select display_name from profiles where id = uid), 'Former member')
    where a.user_id = uid;
  else
    delete from answers where user_id = uid;
  end if;

  -- Leave every group so open rounds stop waiting on me and admin passes on.
  for gid in select group_id from group_members where user_id = uid loop
    perform leave_group(gid);
  end loop;

  -- Detach storage ownership so the account row can go (column names vary
  -- between storage versions).
  begin
    execute 'update storage.objects set owner = null where owner = $1' using uid;
  exception when others then null;
  end;
  begin
    execute 'update storage.objects set owner_id = null where owner_id = $1' using uid::text;
  exception when others then null;
  end;

  delete from auth.users where id = uid;
end
$$;

revoke execute on function public.my_answer_paths() from public, anon;
revoke execute on function public.delete_answer(uuid) from public, anon;
revoke execute on function public.delete_my_account(boolean) from public, anon;
grant execute on function public.my_answer_paths() to authenticated;
grant execute on function public.delete_answer(uuid) to authenticated;
grant execute on function public.delete_my_account(boolean) to authenticated;

-- Beta: launch-update opt-in and richer feedback.

-- null = not asked yet; true/false = their answer, with when they gave it.
alter table public.profiles add column launch_updates boolean;
alter table public.profiles add column launch_updates_at timestamptz;

-- Feedback can be a quick rating, a message, or both, plus where it was given.
alter table public.feedback alter column message drop not null;
alter table public.feedback drop constraint feedback_message_check;
alter table public.feedback add column rating smallint check (rating between 1 and 3);
alter table public.feedback add column context text;
alter table public.feedback add constraint feedback_has_content check (
  (message is not null and char_length(message) between 1 and 4000) or (message is null and rating is not null)
);

-- Emoji reactions and text comment threads on voice answers.
-- Only available once a round has unlocked, and only to that circle's members.

create table public.answer_reactions (
  answer_id uuid not null references public.answers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '😂', '🥹', '🙏', '👏', '😮')),
  created_at timestamptz not null default now(),
  primary key (answer_id, user_id, emoji)
);

create table public.answer_comments (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index answer_comments_answer_idx on public.answer_comments (answer_id, created_at);

-- True when the answer's round is unlocked and I'm in that circle.
create function public.can_react(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from answers a join rounds r on r.id = a.round_id
    where a.id = aid and r.status = 'unlocked' and is_member(r.group_id)
  )
$$;

alter table public.answer_reactions enable row level security;
alter table public.answer_comments enable row level security;

create policy "see reactions" on public.answer_reactions for select using (public.can_react(answer_id));
create policy "add own reaction" on public.answer_reactions for insert
  with check (user_id = auth.uid() and public.can_react(answer_id));
create policy "remove own reaction" on public.answer_reactions for delete using (user_id = auth.uid());

create policy "see comments" on public.answer_comments for select using (public.can_react(answer_id));
create policy "add own comment" on public.answer_comments for insert
  with check (user_id = auth.uid() and public.can_react(answer_id));
create policy "delete own comment" on public.answer_comments for delete using (user_id = auth.uid());

-- Push the speaker and earlier commenters about a new comment.
create function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a answers;
  gname text;
  author text;
  rid uuid;
begin
  select * into a from answers where id = new.answer_id;
  select g.name, r.id into gname, rid from rounds r join groups g on g.id = r.group_id where r.id = a.round_id;
  select coalesce(display_name, 'Someone') into author from profiles where id = new.user_id;

  if a.user_id is not null and a.user_id <> new.user_id then
    perform notify_users(array[a.user_id], gname, author || ' commented on your answer: ' || left(new.body, 80), '/r/' || rid);
  end if;

  perform notify_users(
    array(
      select distinct c.user_id from answer_comments c
      where c.answer_id = new.answer_id and c.user_id <> new.user_id and c.user_id is distinct from a.user_id
    ),
    gname,
    author || ' replied: ' || left(new.body, 80),
    '/r/' || rid
  );
  return new;
end
$$;

create trigger on_answer_comment
  after insert on public.answer_comments
  for each row execute function public.notify_comment();

-- Fix: an answer recorded while someone else swapped the question was saved
-- against the new question. Answers now carry the question the person saw,
-- and everyone else in the round is told when the question changes.

drop function public.submit_answer(uuid, text, text, int);

-- qid: the question shown when recording. Optional so older app versions keep working.
create function public.submit_answer(rid uuid, path text, mime text, duration int, qid int default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r rounds;
begin
  -- Lock the round so a question swap and an answer can't interleave.
  select * into r from rounds where id = rid for update;
  if r is null or r.status <> 'open' then
    raise exception 'this round is closed';
  end if;
  if qid is not null and qid <> r.question_id then
    raise exception 'question_changed';
  end if;
  if not exists (select 1 from round_participants where round_id = rid and user_id = auth.uid()) then
    raise exception 'you are not part of this round';
  end if;
  if split_part(path, '/', 1) <> rid::text or split_part(path, '/', 2) <> auth.uid()::text then
    raise exception 'invalid upload path';
  end if;
  insert into answers (round_id, user_id, storage_path, mime_type, duration_ms)
  values (rid, auth.uid(), path, mime, duration);
  return check_unlock(rid);
end
$$;

create or replace function public.shuffle_question(rid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r rounds;
  new_qid int;
  others uuid[];
begin
  select * into r from rounds where id = rid for update;
  if r is null or not is_member(r.group_id) then
    raise exception 'round not found';
  end if;
  if r.status <> 'open' or exists (select 1 from answers where round_id = rid) then
    raise exception 'the question can only change before the first answer';
  end if;
  new_qid := pick_question(r.group_id, r.question_id);
  update rounds set question_id = new_qid where id = rid;

  select array_agg(user_id) into others from round_participants where round_id = rid and user_id <> auth.uid();
  perform notify_users(
    others,
    (select name from groups where id = r.group_id),
    (select coalesce(display_name, 'Someone') from profiles where id = auth.uid())
      || ' changed the question: ' || (select text from questions where id = new_qid),
    '/r/' || rid
  );
  return new_qid;
end
$$;

