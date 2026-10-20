-- Chorus update: deleting answers and accounts. Run once in Supabase > SQL Editor.

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
