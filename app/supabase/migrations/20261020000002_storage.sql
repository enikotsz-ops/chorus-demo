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
