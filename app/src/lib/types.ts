export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  /** null until asked */
  launch_updates: boolean | null;
};

export type Group = {
  id: string;
  name: string;
  created_by: string | null;
  questions_per_week: number;
  release_hour: number;
  timezone: string;
  invite_code: string;
  next_release_at: string | null;
};

export type Member = { user_id: string; role: "admin" | "member"; profile?: Profile };

export type Answer = {
  id: string;
  /** null once the speaker deleted their account but left the recording */
  user_id: string | null;
  speaker_name: string | null;
  storage_path: string;
  mime_type: string;
  duration_ms: number;
  created_at: string;
  reactions: Reaction[];
  comments: Comment[];
};

export const REACTIONS = ["❤️", "😂", "🥹", "🙏", "👏", "😮"] as const;

export type Reaction = { emoji: string; user_id: string };

export type Comment = { id: string; user_id: string; body: string; created_at: string };

export type Round = {
  id: string;
  group_id: string;
  opens_at: string;
  base_deadline: string;
  deadline: string;
  extensions_used: number;
  status: "open" | "unlocked" | "expired";
  unlocked_at: string | null;
  question: { id: number; text: string; theme: string };
  participants: string[];
  answers: Answer[];
};
