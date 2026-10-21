-- Chorus update: allow up to 7 questions a week. Run once in Supabase > SQL Editor.

-- Allow up to 7 questions a week.

alter table public.groups drop constraint groups_questions_per_week_check;
alter table public.groups add constraint groups_questions_per_week_check check (questions_per_week between 1 and 7);

-- ISO weekdays questions are released on.
create or replace function public.release_days(qpw int) returns int[]
language sql immutable as $$
  select case qpw
    when 1 then array[1]
    when 2 then array[1, 4]
    when 3 then array[1, 3, 5]
    when 4 then array[1, 3, 5, 7]
    when 5 then array[1, 2, 3, 4, 5]
    when 6 then array[1, 2, 3, 4, 5, 6]
    else array[1, 2, 3, 4, 5, 6, 7]
  end
$$;

-- Extension lengths shrink with each use and scale with the question window.
create or replace function public.extension_length(qpw int, n int) returns interval
language sql immutable as $$
  select (case
    when qpw = 1 then array[interval '1 day', interval '6 hours', interval '1 hour']
    when qpw = 2 then array[interval '12 hours', interval '3 hours', interval '30 minutes']
    when qpw = 3 then array[interval '8 hours', interval '2 hours', interval '20 minutes']
    when qpw = 4 then array[interval '6 hours', interval '2 hours', interval '30 minutes']
    else array[interval '3 hours', interval '1 hour', interval '15 minutes']
  end)[n]
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
  insert into notifications (user_id, title, body, url)
  select due.user_id, gr.name, 'Everyone is waiting to hear from you.', '/r/' || due.round_id
  from due
  join rounds rd on rd.id = due.round_id
  join groups gr on gr.id = rd.group_id;
end
$$;
