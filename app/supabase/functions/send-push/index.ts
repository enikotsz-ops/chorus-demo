// Drains the notifications outbox and delivers each one as a Web Push message.
// Called every minute by pg_cron (see supabase/setup/cron.sql).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@getchorus.org",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  const { data: pending, error } = await supabase
    .from("notifications")
    .select("id, user_id, title, body, url")
    .is("sent_at", null)
    .order("created_at")
    .limit(200);
  if (error) return new Response(error.message, { status: 500 });
  if (!pending?.length) return Response.json({ sent: 0 });

  const userIds = [...new Set(pending.map((n) => n.user_id))];
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, user_id, p256dh, auth")
    .in("user_id", userIds);

  let sent = 0;
  const gone: string[] = [];
  for (const n of pending) {
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url });
    for (const s of (subs ?? []).filter((s) => s.user_id === n.user_id)) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (e) {
        // 404/410 mean the browser dropped the subscription.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.endpoint);
        else console.error("push failed", status, (e as Error).message);
      }
    }
  }

  await supabase
    .from("notifications")
    .update({ sent_at: new Date().toISOString() })
    .in("id", pending.map((n) => n.id));
  if (gone.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", gone);
  }
  return Response.json({ sent, removed: gone.length });
});
