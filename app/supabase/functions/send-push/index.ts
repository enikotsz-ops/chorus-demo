// Drains the notifications outbox and delivers each one as a Web Push message.
// Called every minute by pg_cron (see supabase/setup/cron.sql).
// Setup problems are reported in the response instead of crashing the worker,
// so they show up in net._http_response.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const json = (body: unknown, status = 200) => Response.json(body, { status });

// Anything older than this is out of date ("new question", "1 hour left"...)
// and is marked done without being sent, e.g. after downtime.
const STALE_AFTER_MS = 60 * 60 * 1000;

type Recipient = { id: string; email: string | null; display_name: string | null; email_reminders: boolean };
type Note = { title: string; body: string; url: string };

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function emailText(n: Note, appUrl: string) {
  return [
    `${n.title}`,
    "",
    n.body,
    "",
    "Open Chorus from your Home Screen to answer, or go to:",
    `${appUrl}${n.url}`,
    "",
    "You're getting this because push reminders aren't switched on for you. Turn email reminders off in Chorus under You.",
  ].join("\n");
}

function emailHtml(n: Note, name: string | null, appUrl: string) {
  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1B1A17">
  <p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8A8263;margin:0 0 12px">${escape(n.title)}</p>
  <p style="font-size:15px;margin:0 0 8px">Hi${name ? " " + escape(name) : ""},</p>
  <p style="font-size:22px;line-height:1.3;font-weight:600;background:#FBF3D7;border-radius:16px;padding:18px;margin:0 0 20px">${escape(n.body)}</p>
  <p style="font-size:15px;margin:0 0 20px">Open <b>Chorus from your Home Screen</b> to answer. On a computer, use the button below.</p>
  <p style="margin:0 0 28px"><a href="${appUrl}${n.url}" style="display:inline-block;background:#1B1A17;color:#fff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:14px">Open Chorus</a></p>
  <p style="font-size:12px;color:#6E695C;margin:0">You're getting this because push reminders aren't switched on for you. You can turn email reminders off in Chorus under <b>You</b>.</p>
</div>`;
}

// Short fingerprint so mismatched secrets can be compared without revealing them.
async function fingerprint(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const expected = Deno.env.get("CRON_SECRET")?.trim();
  const received = req.headers.get("x-cron-secret")?.trim() ?? "";
  if (!expected) {
    return json({ error: "missing secrets", missing: ["CRON_SECRET"] }, 500);
  }
  if (received !== expected) {
    return json(
      {
        error: "forbidden: x-cron-secret does not match CRON_SECRET",
        stored: { length: expected.length, fingerprint: await fingerprint(expected) },
        sent: { length: received.length, fingerprint: await fingerprint(received) },
      },
      403,
    );
  }

  const env = {
    url: Deno.env.get("SUPABASE_URL"),
    // Newer projects may only expose the secret key under a different name.
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY"),
    vapidPublic: Deno.env.get("VAPID_PUBLIC_KEY")?.trim(),
    vapidPrivate: Deno.env.get("VAPID_PRIVATE_KEY")?.trim(),
    vapidSubject: Deno.env.get("VAPID_SUBJECT")?.trim() || "mailto:hello@getchorus.org",
    // Optional: without it, email reminders are simply skipped.
    resendKey: Deno.env.get("RESEND_API_KEY")?.trim(),
    // Only overridden for local testing.
    resendUrl: Deno.env.get("RESEND_API_URL")?.trim() || "https://api.resend.com/emails",
    emailFrom: Deno.env.get("EMAIL_FROM")?.trim() || "Chorus <hello@getchorus.org>",
    appUrl: (Deno.env.get("APP_URL")?.trim() || "https://chorus-demo.vercel.app").replace(/\/$/, ""),
  };
  const missing = [
    !env.url && "SUPABASE_URL",
    !env.serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    !env.vapidPublic && "VAPID_PUBLIC_KEY",
    !env.vapidPrivate && "VAPID_PRIVATE_KEY",
  ].filter(Boolean);
  if (missing.length) return json({ error: "missing secrets", missing }, 500);

  try {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublic!, env.vapidPrivate!);
  } catch (e) {
    return json({ error: "invalid VAPID keys or subject", detail: (e as Error).message }, 500);
  }

  try {
    const supabase = createClient(env.url!, env.serviceKey!);

    const { data: pending, error } = await supabase
      .from("notifications")
      .select("id, user_id, title, body, url, created_at, email")
      .is("sent_at", null)
      .order("created_at")
      .limit(200);
    if (error) return json({ error: "reading notifications failed", detail: error.message }, 500);
    if (!pending?.length) return json({ sent: 0 });

    const cutoff = Date.now() - STALE_AFTER_MS;
    const stale = pending.filter((n) => new Date(n.created_at).getTime() < cutoff);
    if (stale.length) {
      await supabase
        .from("notifications")
        .update({ sent_at: new Date().toISOString() })
        .in("id", stale.map((n) => n.id));
    }
    const fresh = pending.filter((n) => new Date(n.created_at).getTime() >= cutoff);
    if (!fresh.length) return json({ sent: 0, skipped_stale: stale.length });

    const userIds = [...new Set(fresh.map((n) => n.user_id))];
    const { data: subs, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("endpoint, user_id, p256dh, auth")
      .in("user_id", userIds);
    if (subsError) return json({ error: "reading subscriptions failed", detail: subsError.message }, 500);

    let sent = 0;
    const failures: string[] = [];
    const gone: string[] = [];
    // Notifications that reached at least one device; the rest can fall back to email.
    const pushed = new Set<number>();
    for (const n of fresh) {
      const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url });
      for (const s of (subs ?? []).filter((s) => s.user_id === n.user_id)) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 }, // phones offline longer than this get nothing rather than old news
          );
          sent++;
          pushed.add(n.id);
        } catch (e) {
          // 404/410 mean the browser dropped the subscription.
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(s.endpoint);
          else failures.push(`${status ?? "?"}: ${(e as Error).message}`.slice(0, 200));
        }
      }
    }

    // Email the important ones that no push reached, and
    // record the outcome on each notification (email_status / email_error).
    let emailed = 0;
    const emailFailures: string[] = [];
    const outcomes = new Map<number, { email_status: string; email_error?: string; emailed_at?: string }>();
    const emailable = fresh.filter((n) => n.email);
    for (const n of emailable) if (pushed.has(n.id)) outcomes.set(n.id, { email_status: "has_push" });
    const toEmail = emailable.filter((n) => !pushed.has(n.id));

    if (toEmail.length && !env.resendKey) {
      for (const n of toEmail) outcomes.set(n.id, { email_status: "no_api_key" });
    } else if (toEmail.length) {
      const { data: people, error: peopleError } = await supabase.rpc("notification_recipients", {
        user_ids: [...new Set(toEmail.map((n) => n.user_id))],
      });
      if (peopleError) emailFailures.push(`recipients: ${peopleError.message}`);
      const byId = new Map(((people ?? []) as Recipient[]).map((p) => [p.id, p]));
      for (const n of toEmail) {
        const person = byId.get(n.user_id);
        if (!person) {
          outcomes.set(n.id, { email_status: "failed", email_error: peopleError?.message ?? "recipient not found" });
          continue;
        }
        if (!person.email_reminders) {
          outcomes.set(n.id, { email_status: "email_off" });
          continue;
        }
        if (!person.email) {
          outcomes.set(n.id, { email_status: "no_address" });
          continue;
        }
        try {
          const res = await fetch(env.resendUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: env.emailFrom,
              to: person.email,
              subject: `${n.title}: ${n.body}`.slice(0, 140),
              html: emailHtml(n, person.display_name, env.appUrl),
              text: emailText(n, env.appUrl),
            }),
          });
          if (res.ok) {
            emailed++;
            outcomes.set(n.id, { email_status: "sent", emailed_at: new Date().toISOString() });
          } else {
            const detail = `${res.status}: ${(await res.text()).slice(0, 300)}`;
            emailFailures.push(detail.slice(0, 150));
            outcomes.set(n.id, { email_status: "failed", email_error: detail });
          }
        } catch (e) {
          const detail = (e as Error).message.slice(0, 300);
          emailFailures.push(detail);
          outcomes.set(n.id, { email_status: "failed", email_error: detail });
        }
      }
    }
    for (const [id, outcome] of outcomes) {
      await supabase.from("notifications").update(outcome).eq("id", id);
    }

    await supabase
      .from("notifications")
      .update({ sent_at: new Date().toISOString() })
      .in("id", fresh.map((n) => n.id));
    if (gone.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", gone);
    }
    return json({
      notifications: fresh.length,
      skipped_stale: stale.length,
      subscriptions: subs?.length ?? 0,
      sent,
      removed: gone.length,
      failures: failures.slice(0, 5),
      emailed,
      email_skipped_no_key: toEmail.length && !env.resendKey ? toEmail.length : 0,
      email_failures: emailFailures.slice(0, 5),
    });
  } catch (e) {
    return json({ error: "unexpected failure", detail: (e as Error).message }, 500);
  }
});
