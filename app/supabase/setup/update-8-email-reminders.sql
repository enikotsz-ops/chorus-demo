-- Chorus update: email reminders for people without push. Run once in Supabase > SQL Editor.

-- Email reminders for people without push notifications.
-- Important notifications (new question, deadline reminder, last chance,
-- unlocked) are flagged for email; the send-push function emails them to
-- anyone with no push-enabled device who hasn't switched email off.

alter table public.profiles add column email_reminders boolean not null default true;
alter table public.notifications add column email boolean not null default false;

drop function public.notify_users(uuid[], text, text, text);

create function public.notify_users(user_ids uuid[], title text, body text, url text, email boolean default false)
returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, title, body, url, email)
  select u, title, body, url, email from unnest(user_ids) as u
$$;
revoke execute on function public.notify_users(uuid[], text, text, text, boolean) from public, anon, authenticated;

-- Email addresses for the push sender (service role only).
create function public.notification_recipients(user_ids uuid[])
returns table (id uuid, email text, display_name text, email_reminders boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, p.display_name, p.email_reminders
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = any(user_ids)
$$;
revoke execute on function public.notification_recipients(uuid[]) from public, anon, authenticated;
grant execute on function public.notification_recipients(uuid[]) to service_role;

create or replace function public.open_round(gid uuid, deadline_at timestamptz) returns uuid
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
  perform notify_users(
    members, gname,
    'New question: ' || (select q.text from rounds rd join questions q on q.id = rd.question_id where rd.id = rid),
    '/r/' || rid, true);
  return rid;
end
$$;

create or replace function public.check_unlock(rid uuid) returns boolean
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
  perform notify_users(members, 'Your round is unlocked', 'Everyone answered. Have a listen.', '/r/' || rid, true);
  return true;
end
$$;

create or replace function public.chorus_tick() returns void
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
        '/r/' || r.id,
        r.extensions_used + 1 = 3);
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
      and (
        -- Up to 3 a week: evening reminder at the circle's release hour in each
        -- person's own time zone, in the last two days.
        (gr.questions_per_week <= 3
          and rd.deadline - now() between interval '0' and interval '48 hours'
          and rd.opens_at < now() - interval '12 hours'
          and extract(hour from now() at time zone pr.timezone)::int = gr.release_hour)
        -- 4 or more a week: windows are about a day, so remind ~4 hours before the deadline.
        or (gr.questions_per_week >= 4
          and rd.deadline - now() between interval '0' and interval '4 hours')
      )
      and not exists (select 1 from answers a where a.round_id = rd.id and a.user_id = p.user_id)
    on conflict do nothing
    returning round_id, user_id
  )
  insert into notifications (user_id, title, body, url, email)
  select due.user_id, gr.name, 'Everyone is waiting to hear from you.', '/r/' || due.round_id, true
  from due
  join rounds rd on rd.id = due.round_id
  join groups gr on gr.id = rd.group_id;
end
$$;
