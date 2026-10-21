-- Chorus update: emoji reactions and comments on voice answers. Run once in Supabase > SQL Editor.

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
