-- Family or friends circles, questions suggested by members, Moments, and
-- interest in future games.

-- ---------------------------------------------------------------------------
-- Circle type and question audience
-- ---------------------------------------------------------------------------

alter table public.groups add column circle_type text not null default 'family'
  check (circle_type in ('family', 'friends'));

-- 'both' suits any circle; 'family' questions are skipped by friends circles.
alter table public.questions add column audience text not null default 'both'
  check (audience in ('family', 'friends', 'both'));
alter table public.questions add column created_at timestamptz not null default now();

update public.questions set audience = 'family' where text in (
  'Who in our family history do you wish you''d asked more questions?',
  'What''s a family story you''ve heard so often you could tell it yourself?',
  'Which relative do people say you take after, and do you agree?',
  'What do you know about how your parents or grandparents met?',
  'Is there a family recipe, saying or habit you hope never gets lost?',
  'What would you like our family to be doing together in ten years?'
);

-- ---------------------------------------------------------------------------
-- Suggested questions: private to one circle, credited to whoever asked
-- ---------------------------------------------------------------------------

alter table public.questions add column group_id uuid references public.groups (id) on delete cascade;
alter table public.questions add column suggested_by uuid references auth.users (id) on delete set null;
alter table public.questions add column suggested_by_name text;

-- Library questions stay unique; circles may suggest the same wording.
alter table public.questions drop constraint questions_text_key;
create unique index questions_library_text_key on public.questions (text) where group_id is null;
create index questions_group_idx on public.questions (group_id) where group_id is not null;

drop policy "anyone signed in reads questions" on public.questions;
create policy "read library and own circles' questions" on public.questions for select to authenticated
  using (group_id is null or public.is_member(group_id));

create function public.suggest_question(gid uuid, question text) returns int
language plpgsql security definer set search_path = public as $$
declare
  qid int;
begin
  if not is_member(gid) then
    raise exception 'you are not in this circle';
  end if;
  if char_length(btrim(question)) not between 5 and 200 then
    raise exception 'questions need to be between 5 and 200 characters';
  end if;
  insert into questions (theme, text, group_id, suggested_by, suggested_by_name)
  values (
    'Suggested',
    btrim(question),
    gid,
    auth.uid(),
    coalesce((select display_name from profiles where id = auth.uid()), 'Someone')
  )
  returning id into qid;
  return qid;
end
$$;

-- The person who suggested it, or the circle admin, can remove it before it's asked.
create function public.delete_suggestion(qid int) returns void
language plpgsql security definer set search_path = public as $$
declare
  q questions;
begin
  select * into q from questions where id = qid;
  if q.group_id is null or not (q.suggested_by = auth.uid() or is_admin(q.group_id)) then
    raise exception 'you can only remove your own suggestions';
  end if;
  if exists (select 1 from rounds where question_id = qid) then
    raise exception 'this question has already been asked';
  end if;
  delete from questions where id = qid;
end
$$;

-- Suggestions come first (oldest first), then unused library questions that
-- suit the circle, then anything already asked.
create or replace function public.pick_question(gid uuid, exclude int default null) returns int
language sql volatile security definer set search_path = public as $$
  select q.id from questions q
  where q.id is distinct from exclude
    and (q.group_id = gid
      or (q.group_id is null
        and q.audience in ('both', (select circle_type from groups where id = gid)))
    )
  order by
    (q.id in (select question_id from rounds where group_id = gid)),
    (q.group_id is null),
    case when q.group_id is not null then q.created_at end,
    random()
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Creating and editing circles with a type
-- ---------------------------------------------------------------------------

drop function public.create_group(text, int, int, text);
create function public.create_group(
  group_name text, qpw int default 1, hour int default 18, tz text default 'Europe/London',
  ctype text default 'family'
)
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

  insert into groups (name, created_by, questions_per_week, release_hour, timezone, next_release_at, circle_type)
  values (group_name, auth.uid(), qpw, hour, tz, first_deadline, ctype)
  returning id into gid;
  insert into group_members (group_id, user_id, role) values (gid, auth.uid(), 'admin');

  -- Start straight away so a new circle has something to answer.
  perform open_round(gid, first_deadline);
  return gid;
end
$$;

drop function public.update_group_settings(uuid, text, int, int, text);
create function public.update_group_settings(
  gid uuid, group_name text, qpw int, hour int, tz text, ctype text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(gid) then
    raise exception 'only the group admin can change settings';
  end if;
  -- Applies to future releases; open rounds keep their deadlines.
  update groups
  set name = group_name, questions_per_week = qpw, release_hour = hour, timezone = tz,
      circle_type = coalesce(ctype, circle_type),
      next_release_at = next_slot(now(), qpw, hour, tz)
  where id = gid;
end
$$;

-- ---------------------------------------------------------------------------
-- Moments: people can always replay their own recordings, even while locked
-- ---------------------------------------------------------------------------

create policy "listen to own answers" on storage.objects for select to authenticated
  using (bucket_id = 'answers' and split_part(name, '/', 2) = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Play tab: which games people would play
-- ---------------------------------------------------------------------------

create table public.game_interest (
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null check (char_length(game) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (user_id, game)
);
alter table public.game_interest enable row level security;
create policy "own game interest" on public.game_interest for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
