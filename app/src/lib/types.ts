export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  /** null until asked */
  launch_updates: boolean | null;
  /** Email for important reminders when push isn't set up. */
  email_reminders?: boolean;
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
  circle_type?: CircleType;
};

export type CircleType = "family" | "friends";

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

export type Reaction = { emoji: string; user_id: string; created_at?: string };

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
  question: Question;
  participants: string[];
  answers: Answer[];
};

export type Question = {
  id: number;
  text: string;
  theme: string;
  /** Set when a circle member suggested it */
  suggested_by?: string | null;
  suggested_by_name?: string | null;
};

/** Label shown on the question pill: the theme, or who suggested it. */
export const questionLabel = (q: Question) => (q.suggested_by_name ? `${q.suggested_by_name} asks` : q.theme);
