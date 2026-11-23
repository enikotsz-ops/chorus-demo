// General invite link to Chorus (not tied to a circle). It carries the
// inviter's id so we can see who brought whom in during testing.
import { saveProfile } from "./api";
import type { Profile } from "./types";

const REF = "chorus:ref";

export const appInviteUrl = (userId: string) => `${window.location.origin}/?ref=${userId}`;

/** Remember ?ref=… from the link someone opened, until they've signed up. */
export function captureReferral() {
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && /^[0-9a-f-]{36}$/i.test(ref)) localStorage.setItem(REF, ref);
  } catch {
    /* storage blocked */
  }
}

/** Best effort: record who invited this person, once. Never blocks sign-up. */
export async function saveReferral(profile: Profile) {
  try {
    const ref = localStorage.getItem(REF);
    if (!ref) return;
    localStorage.removeItem(REF);
    if (ref === profile.id || profile.referred_by) return;
    await saveProfile(profile.id, { referred_by: ref, referred_at: new Date().toISOString() });
  } catch {
    /* column missing or offline: skip */
  }
}

export async function shareInvite(userId: string, name: string | null | undefined) {
  const url = appInviteUrl(userId);
  const text = name
    ? `${name} invited you to Chorus: each week you answer one question by voice and hear each other's stories.`
    : "Join me on Chorus: each week we answer one question by voice and hear each other's stories.";
  if (navigator.share) {
    try {
      await navigator.share({ title: "Chorus", text, url });
      return "shared";
    } catch {
      return "dismissed";
    }
  }
  await navigator.clipboard.writeText(`${text} ${url}`);
  return "copied";
}
