import type { Round } from "./types";

/**
 * Questions answered in a row, newest first, across all circles. Open rounds
 * not yet answered don't break the streak (there's still time); a round that
 * locked without my answer does.
 */
export function answerStreak(rounds: Round[], me: string) {
  const mine = rounds
    .filter((r) => r.participants.includes(me))
    .sort((a, b) => b.opens_at.localeCompare(a.opens_at));
  let streak = 0;
  for (const r of mine) {
    const answered = r.answers.some((a) => a.user_id === me);
    if (answered) streak++;
    else if (r.status === "open") continue;
    else break;
  }
  return streak;
}

/** My unlocked answer with the most reactions (then comments, then newest). */
export function mostLoved(rounds: Round[], me: string) {
  const candidates = rounds
    .filter((r) => r.status === "unlocked")
    .flatMap((r) => r.answers.filter((a) => a.user_id === me && a.reactions.length > 0).map((a) => ({ a, r })));
  candidates.sort(
    (x, y) =>
      y.a.reactions.length - x.a.reactions.length ||
      y.a.comments.length - x.a.comments.length ||
      y.a.created_at.localeCompare(x.a.created_at),
  );
  return candidates[0] ?? null;
}
