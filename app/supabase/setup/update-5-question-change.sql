-- Chorus update: stop answers being saved against a question that was swapped. Run once in Supabase > SQL Editor.

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
