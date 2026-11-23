import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useCircles } from "../lib/circles";
import { usePlayer } from "../lib/player";
import { mostLoved } from "../lib/stats";
import { formatDuration, isUrgent, timeLeft } from "../lib/time";
import { Icon } from "./Icon";

/** Shown first on You when questions are waiting: the circle can't hear anything until you answer. */
export function WaitingOnYou() {
  const navigate = useNavigate();
  const { waiting, circles } = useCircles();
  if (!waiting.length) return null;
  const next = waiting[0];
  const circleName = circles.find((c) => c.id === next.group_id)?.name ?? "Your circle";

  return (
    <div className="card waiting-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="eyebrow" style={{ color: "var(--ink-2)" }}>
          {waiting.length === 1 ? "1 question is waiting on you" : `${waiting.length} questions are waiting on you`}
        </span>
        <span className={`deadline ${isUrgent(next.deadline) ? "urgent" : ""}`}>{timeLeft(next.deadline)}</span>
      </div>
      <p className="question sm">{next.question.text}</p>
      <span className="small muted">
        {circleName} can't hear anything until you answer.
      </span>
      <button className="btn primary block" onClick={() => navigate(`/r/${next.id}`)}>
        <Icon name="mic" /> Record now
      </button>
    </div>
  );
}

/** The answer of mine people reacted to most. */
export function MostLovedStory() {
  const navigate = useNavigate();
  const { userId, profile } = useAuth();
  const { rounds, circles } = useCircles();
  const player = usePlayer();
  const best = mostLoved(rounds, userId ?? "");
  if (!best) return null;
  const { a, r } = best;
  const emojis = [...new Set(a.reactions.map((x) => x.emoji))].slice(0, 4).join(" ");
  const isPlaying = player.current?.id === a.id && player.playing;

  return (
    <div className="card loved" onClick={() => navigate(`/r/${r.id}`)} role="link" tabIndex={0}>
      <span className="eyebrow">Your most-loved story</span>
      <p className="question sm">{r.question.text}</p>
      <div className="row">
        <button
          className="mini-play"
          aria-label={isPlaying ? "Pause" : "Play your story"}
          onClick={(e) => {
            e.stopPropagation();
            if (isPlaying) player.toggle();
            else
              player.play([
                { id: a.id, path: a.storage_path, title: profile?.display_name ?? "You", subtitle: r.question.text },
              ]);
          }}
        >
          <Icon name={isPlaying ? "pause" : "play"} size={18} />
        </button>
        <span className="grow small muted">
          {formatDuration(a.duration_ms)} · {circles.find((c) => c.id === r.group_id)?.name}
        </span>
        <span className="loved-count">
          {emojis} {a.reactions.length}
          {a.comments.length > 0 && <span className="small muted"> · 💬 {a.comments.length}</span>}
        </span>
      </div>
    </div>
  );
}
