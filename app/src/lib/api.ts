import { supabase } from "./supabase";
import type { Answer, Group, Member, Profile, Round } from "./types";

type RawRound = Omit<Round, "participants" | "question"> & {
  questions: Round["question"];
  round_participants: { user_id: string }[];
};

const ROUND_SELECT =
  "id, group_id, opens_at, base_deadline, deadline, extensions_used, status, unlocked_at, " +
  "questions(id, text, theme), round_participants(user_id), " +
  "answers(id, user_id, speaker_name, storage_path, mime_type, duration_ms, created_at)";

function toRound(r: RawRound): Round {
  const { questions, round_participants, ...rest } = r;
  return {
    ...rest,
    question: questions,
    participants: round_participants.map((p) => p.user_id),
    answers: [...r.answers].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function getProfile(id: string): Promise<Profile | null> {
  return check(await supabase.from("profiles").select("*").eq("id", id).maybeSingle());
}

export async function saveProfile(id: string, fields: Partial<Profile>) {
  check(await supabase.from("profiles").update(fields).eq("id", id));
}

export async function myGroups(userId: string): Promise<(Group & { role: string })[]> {
  const rows = check(
    await supabase.from("group_members").select("role, groups(*)").eq("user_id", userId),
  ) as unknown as { role: string; groups: Group }[];
  return rows.map((r) => ({ ...r.groups, role: r.role }));
}

export async function getGroup(id: string): Promise<Group> {
  return check(await supabase.from("groups").select("*").eq("id", id).single());
}

export async function getMembers(groupId: string): Promise<Member[]> {
  const members = check(
    await supabase.from("group_members").select("user_id, role").eq("group_id", groupId).order("joined_at"),
  ) as Member[];
  const profiles = check(
    await supabase.from("profiles").select("*").in("id", members.map((m) => m.user_id)),
  ) as Profile[];
  return members.map((m) => ({ ...m, profile: profiles.find((p) => p.id === m.user_id) }));
}

export async function getRounds(groupId: string): Promise<Round[]> {
  const rows = check(
    await supabase.from("rounds").select(ROUND_SELECT).eq("group_id", groupId).order("opens_at", { ascending: false }),
  ) as unknown as RawRound[];
  return rows.map(toRound);
}

export async function getRound(id: string): Promise<Round> {
  const row = check(await supabase.from("rounds").select(ROUND_SELECT).eq("id", id).single());
  return toRound(row as unknown as RawRound);
}

export async function createGroup(name: string, qpw: number, hour: number, tz: string): Promise<string> {
  return check(await supabase.rpc("create_group", { group_name: name, qpw, hour, tz })) as string;
}

export async function groupPreview(code: string) {
  const rows = check(await supabase.rpc("group_preview", { code })) as { id: string; name: string; member_count: number }[];
  return rows[0] ?? null;
}

export async function joinGroup(code: string): Promise<string> {
  return check(await supabase.rpc("join_group", { code })) as string;
}

export async function leaveGroup(gid: string) {
  check(await supabase.rpc("leave_group", { gid }));
}

export async function removeMember(gid: string, uid: string) {
  check(await supabase.rpc("remove_member", { gid, uid }));
}

export async function updateGroupSettings(gid: string, name: string, qpw: number, hour: number, tz: string) {
  check(await supabase.rpc("update_group_settings", { gid, group_name: name, qpw, hour, tz }));
}

export async function shuffleQuestion(rid: string) {
  check(await supabase.rpc("shuffle_question", { rid }));
}

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
};

/** Uploads the recording, then registers it. Returns true if the round unlocked. */
export async function submitAnswer(rid: string, userId: string, blob: Blob, durationMs: number): Promise<boolean> {
  const mime = blob.type.split(";")[0] || "audio/webm";
  const path = `${rid}/${userId}/${Date.now()}.${EXT[mime] ?? "audio"}`;
  const up = await supabase.storage.from("answers").upload(path, blob, { contentType: mime });
  if (up.error) throw new Error(up.error.message);
  return check(
    await supabase.rpc("submit_answer", { rid, path, mime, duration: Math.max(1, Math.round(durationMs)) }),
  ) as boolean;
}

export async function audioUrl(path: string): Promise<string> {
  const res = await supabase.storage.from("answers").createSignedUrl(path, 60 * 60);
  if (res.error) throw new Error(res.error.message);
  return res.data.signedUrl;
}

export async function registerUnlockInterest(rid: string, userId: string) {
  const res = await supabase.from("unlock_interest").insert({ round_id: rid, user_id: userId });
  if (res.error && res.error.code !== "23505") throw new Error(res.error.message);
}

export async function hasUnlockInterest(rid: string, userId: string): Promise<boolean> {
  const rows = check(
    await supabase.from("unlock_interest").select("round_id").eq("round_id", rid).eq("user_id", userId),
  ) as unknown[];
  return rows.length > 0;
}

/** Removes the audio file first, so a failed step can simply be retried. */
export async function deleteAnswer(answer: Answer) {
  const res = await supabase.storage.from("answers").remove([answer.storage_path]);
  if (res.error) throw new Error(res.error.message);
  check(await supabase.rpc("delete_answer", { aid: answer.id }));
}

/** Deletes the account. With keepRecordings, answers stay with their groups under the person's name. */
export async function deleteAccount(keepRecordings: boolean) {
  if (!keepRecordings) {
    const paths = check(await supabase.rpc("my_answer_paths")) as string[];
    for (let i = 0; i < paths.length; i += 100) {
      const res = await supabase.storage.from("answers").remove(paths.slice(i, i + 100));
      if (res.error) throw new Error(res.error.message);
    }
  }
  check(await supabase.rpc("delete_my_account", { keep_recordings: keepRecordings }));
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
}

export async function sendFeedback(userId: string, message: string, page: string) {
  check(await supabase.from("feedback").insert({ user_id: userId, message, page }));
}
