-- Chorus update: thumbs up/down on questions. Run once in Supabase > SQL Editor.

-- Thumbs up/down on questions, to learn which ones lead to good stories.
-- One vote per person per round; they can change it.

create table public.question_votes (
  round_id uuid not null references public.rounds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id int not null references public.questions (id),
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);
create index question_votes_question_idx on public.question_votes (question_id);

alter table public.question_votes enable row level security;

-- The question_id must be the round's current question.
create function public.vote_matches_round(rid uuid, qid int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rounds where id = rid and question_id = qid and is_member(group_id))
$$;

create policy "see own votes" on public.question_votes for select using (user_id = auth.uid());
create policy "add own vote" on public.question_votes for insert
  with check (user_id = auth.uid() and public.vote_matches_round(round_id, question_id));
create policy "change own vote" on public.question_votes for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.vote_matches_round(round_id, question_id));
create policy "remove own vote" on public.question_votes for delete using (user_id = auth.uid());
