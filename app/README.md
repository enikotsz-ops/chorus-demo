# Chorus app

The installable mobile web app behind getchorus.org. Groups answer the same question by voice; answers stay locked until everyone has answered.

- `src/` React + Vite front end (a PWA: installable, push notifications)
- `supabase/migrations/` database schema, round rules, security policies, starter questions
- `supabase/functions/send-push/` sends queued push notifications
- `supabase/setup/cron.sql` schedules the round clock and the push sender

The landing page at the repo root is separate and untouched.

## How rounds work

| Questions/week | Released (group's time zone) | Window | Automatic extensions |
|---|---|---|---|
| 1 | Mon | 7 days | 1 day, 6 hours, 1 hour |
| 2 | Mon, Thu | 3 to 4 days | 12 hours, 3 hours, 30 minutes |
| 3 | Mon, Wed, Fri | 2 to 3 days | 8 hours, 2 hours, 20 minutes |

- Questions arrive at 6pm by default; the group admin can change the time, time zone and questions per week.
- "New question" works only before anyone has answered.
- Answers can be up to 10 minutes and can be re-recorded before sending.
- The round unlocks the moment the last person answers. It needs at least two people.
- After the third extension, the round stays locked for good. Locked rounds show a "would you pay £2 to unlock?" interest button; no payment is taken.
- People who join mid-round are added to open rounds nobody has answered yet; otherwise they start with the next question.
- Recordings are kept until the person deletes them. People can delete any of their answers; when deleting their account they choose to remove all recordings or leave them with their circles (credited by name).
- Push reminders: new question, evening reminder (at the group's release hour in each person's own time zone, during the last two days), each extension, unlock, and permanent lock.

## Setup

### 1. Supabase project

1. Create a project at supabase.com.
2. Run the files in `supabase/migrations/` in order (or paste `supabase/setup/database-all-in-one.sql`), in the SQL editor (or `supabase db push` with the Supabase CLI linked to the project).
3. **Authentication → URL configuration**: set Site URL to `https://app.getchorus.org` and add it (plus `http://localhost:5173` for development) to Redirect URLs.
4. **Authentication → Email templates → Magic link**: make sure the template includes the code, for example `Your Chorus code is {{ .Token }}`. On iPhone, a Home Screen app can't pick up a link opened in Safari, so people need to type the code.
5. Supabase's built-in email sender has low sending limits meant for testing. Before inviting real users, set up custom SMTP (Authentication → SMTP settings) with a provider such as Resend or Postmark. Check Supabase's docs for the current limits.

### 2. Push notification keys

```sh
npx web-push generate-vapid-keys
```

Keep the private key out of the repo.

### 3. Push sender function

```sh
supabase functions deploy send-push --no-verify-jwt
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@getchorus.org CRON_SECRET=$(openssl rand -hex 24)
```

The function rejects any request without the matching `x-cron-secret` header.

### 4. Schedules

Enable the `pg_cron` and `pg_net` extensions (Database → Extensions), then open `supabase/setup/cron.sql`, replace `YOUR-PROJECT-REF` and `YOUR-CRON-SECRET`, and run it in the SQL editor.

### 5. Front end

Local development:

```sh
cp .env.example .env   # fill in URL, anon key, VAPID public key
npm install
npm run dev
```

Hosting on Vercel: import the repo, set **Root Directory** to `app`, add the three `VITE_` variables from `.env.example`, and add the domain `app.getchorus.org` (point a CNAME for `app` at Vercel in your DNS). `vercel.json` handles app routes. Netlify works too (`public/_redirects`).

## Reading feedback and demand

In the SQL editor:

```sql
-- Feedback, newest first
select f.created_at, p.display_name, f.page, f.message
from feedback f left join profiles p on p.id = f.user_id
order by f.created_at desc;

-- £2 unlock interest: how many locked rounds, how many people tapped
select count(distinct round_id) as rounds, count(*) as taps from unlock_interest;
```
