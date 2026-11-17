import type { Member, Round } from "./types";

export type ActivityItem = {
  key: string;
  at: string;
  roundId: string;
  /** Member id for the avatar, or an emoji for circle-wide events */
  who: string | null;
  icon?: string;
  name?: string;
  text: string;
};

const MAX_AGE_DAYS = 30;

/** Recent things that happened in a circle, newest first. */
export function buildActivity(rounds: Round[], members: Member[], me: string, limit = 25): ActivityItem[] {
  const nameOf = (uid: string | null, fallback?: string | null) =>
    uid === me ? "You" : (members.find((m) => m.user_id === uid)?.profile?.display_name ?? fallback ?? "Former member");
  const owner = (uid: string | null, fallback?: string | null) =>
    uid === me ? "your" : `${nameOf(uid, fallback)}'s`;
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const items: ActivityItem[] = [];

  for (const r of rounds) {
    const q = `"${r.question.text}"`;
    const from = r.question.suggested_by_name ? ` from ${r.question.suggested_by_name}` : "";
    items.push({ key: `q-${r.id}`, at: r.opens_at, roundId: r.id, who: null, icon: "✨", text: `New question${from}: ${q}` });
    if (r.status === "unlocked" && r.unlocked_at) {
      items.push({
        key: `u-${r.id}`,
        at: r.unlocked_at,
        roundId: r.id,
        who: null,
        icon: "🔓",
        text: `Round unlocked: ${q} · ${r.answers.length} voices`,
      });
    }
    if (r.status === "expired") {
      items.push({ key: `x-${r.id}`, at: r.deadline, roundId: r.id, who: null, icon: "🔒", text: `Stayed locked: ${q}` });
    }
    for (const a of r.answers) {
      items.push({
        key: `a-${a.id}`,
        at: a.created_at,
        roundId: r.id,
        who: a.user_id,
        name: nameOf(a.user_id, a.speaker_name),
        text: `answered ${q}`,
      });
      for (const re of a.reactions) {
        if (!re.created_at) continue;
        items.push({
          key: `r-${a.id}-${re.user_id}-${re.emoji}`,
          at: re.created_at,
          roundId: r.id,
          who: re.user_id,
          name: nameOf(re.user_id),
          text: `reacted ${re.emoji} to ${owner(a.user_id, a.speaker_name)} answer`,
        });
      }
      for (const c of a.comments) {
        items.push({
          key: `c-${c.id}`,
          at: c.created_at,
          roundId: r.id,
          who: c.user_id,
          name: nameOf(c.user_id),
          text: `commented on ${owner(a.user_id, a.speaker_name)} answer: "${c.body.length > 80 ? c.body.slice(0, 80) + "…" : c.body}"`,
        });
      }
    }
  }

  return items
    .filter((i) => new Date(i.at).getTime() > cutoff && new Date(i.at).getTime() <= Date.now() + 60000)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}
