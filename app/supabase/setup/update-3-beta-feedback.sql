-- Chorus update: launch updates opt-in and feedback ratings. Run once in Supabase > SQL Editor.

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
