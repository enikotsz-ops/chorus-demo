-- Run once in the Supabase SQL editor after the migrations and the send-push
-- function are deployed. Replace the two placeholders first.
--
-- Needs the pg_cron and pg_net extensions (Database -> Extensions).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Releases questions, applies extensions, expires rounds, queues reminders.
select cron.schedule('chorus-tick', '*/5 * * * *', $$ select public.chorus_tick() $$);

-- Delivers queued notifications as push messages.
select cron.schedule('chorus-send-push', '* * * * *', $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body := '{}'::jsonb
  )
$$);
