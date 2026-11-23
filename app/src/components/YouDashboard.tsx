import { useAuth } from "../lib/auth";
import { useCircles } from "../lib/circles";
import { Avatar } from "./Avatar";

const minutesText = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}`;
};

/** Personal stats across all my circles. */
export function YouDashboard() {
  const { userId, profile } = useAuth();
  const { circles, rounds } = useCircles();

  const mine = rounds.flatMap((r) => r.answers.filter((a) => a.user_id === userId));
  // Missed: rounds I was part of that closed for good without my answer.
  const missed = rounds.filter(
    (r) => r.status === "expired" && r.participants.includes(userId ?? "") && !r.answers.some((a) => a.user_id === userId),
  ).length;
  const ms = mine.reduce((t, a) => t + a.duration_ms, 0);
  const first = mine.map((a) => a.created_at).sort()[0];

  return (
    <div className="card dash">
      <div className="row" style={{ gap: 14 }}>
        <Avatar id={userId ?? "me"} name={profile?.display_name} size={56} />
        <div>
          <h2 style={{ fontSize: 24 }}>{profile?.display_name ?? "You"}</h2>
          <span className="small muted">
            {first
              ? `Sharing stories since ${new Date(first).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`
              : "Your first story is waiting"}
          </span>
        </div>
      </div>
      <div className="stats">
        <div>
          <b>{circles.length}</b>
          <span>{circles.length === 1 ? "circle" : "circles"}</span>
        </div>
        <div>
          <b>{mine.length}</b>
          <span>answered</span>
        </div>
        <div className={missed ? "missed" : ""}>
          <b>{missed}</b>
          <span>missed</span>
        </div>
        <div>
          <b>{minutesText(ms)}</b>
          <span>{ms >= 3600000 ? "recorded" : "minutes"}</span>
        </div>
      </div>
      <div className="stat-wide">
        <span className="game-icon small-icon" aria-hidden="true">
          🎲
        </span>
        <span className="grow">
          <b>Most games played with</b>
          <span className="small muted" style={{ display: "block" }}>
            Coming soon with games in Play
          </span>
        </span>
      </div>
    </div>
  );
}
