import { useEffect, useState } from "react";
import { getMyInviteCount, getMySuggestionCount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCircles } from "../lib/circles";
import { answerStreak } from "../lib/stats";

/** Suggestions and invites come from the server; null while loading or unavailable. */
function useImpactCounts() {
  const { userId } = useAuth();
  const [suggested, setSuggested] = useState<number | null>(null);
  const [invited, setInvited] = useState<number | null>(null);
  useEffect(() => {
    if (!userId) return;
    getMySuggestionCount(userId)
      .then(setSuggested)
      .catch(() => setSuggested(null));
    getMyInviteCount()
      .then(setInvited)
      .catch(() => setInvited(null));
  }, [userId]);
  return { suggested, invited };
}

function useMyNumbers() {
  const { userId } = useAuth();
  const { rounds, circles } = useCircles();
  const me = userId ?? "";
  const mine = rounds.flatMap((r) => r.answers.filter((a) => a.user_id === me));
  const reactionsReceived = rounds
    .filter((r) => r.status === "unlocked")
    .reduce((t, r) => t + r.answers.filter((a) => a.user_id === me).reduce((s, a) => s + a.reactions.length, 0), 0);
  const myQuestionRounds = rounds.filter((r) => r.question.suggested_by === me);
  return {
    stories: mine.length,
    ms: mine.reduce((t, a) => t + a.duration_ms, 0),
    streak: answerStreak(rounds, me),
    reactionsReceived,
    startedCircle: circles.some((c) => c.created_by === me),
    askedQuestions: myQuestionRounds.length,
    answersToMyQuestions: myQuestionRounds.reduce((t, r) => t + r.answers.filter((a) => a.user_id !== me).length, 0),
  };
}

/** Badges for the moments that matter, earned or still to go. */
export function Milestones() {
  const n = useMyNumbers();
  const { suggested, invited } = useImpactCounts();
  const badges = [
    { emoji: "🎙️", name: "First story", how: "Record your first answer", earned: n.stories >= 1 },
    { emoji: "📚", name: "10 stories", how: `${Math.min(n.stories, 10)}/10 answers`, earned: n.stories >= 10 },
    { emoji: "⏳", name: "1 hour of voice", how: `${Math.round(n.ms / 60000)}/60 minutes`, earned: n.ms >= 3600000 },
    { emoji: "🔥", name: "5 in a row", how: `Current run: ${n.streak}`, earned: n.streak >= 5 },
    { emoji: "❤️", name: "Loved", how: "Get a reaction on a story", earned: n.reactionsReceived >= 1 },
    { emoji: "💡", name: "Question asker", how: "Suggest a question", earned: Math.max(suggested ?? 0, n.askedQuestions) >= 1 },
    { emoji: "🤝", name: "Connector", how: "Invite someone who joins", earned: (invited ?? 0) >= 1 },
    { emoji: "🏡", name: "Circle starter", how: "Create a circle", earned: n.startedCircle },
  ];
  const earned = badges.filter((b) => b.earned).length;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Milestones</h3>
        <span className="small muted">
          {earned} of {badges.length}
        </span>
      </div>
      <div className="badges">
        {badges.map((b) => (
          <div key={b.name} className={`badge-tile ${b.earned ? "earned" : ""}`} title={b.earned ? b.name : b.how}>
            <span className="badge-emoji" aria-hidden="true">
              {b.emoji}
            </span>
            <b>{b.name}</b>
            <span>{b.earned ? "Earned" : b.how}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** What your questions and invites have led to. */
export function YourImpact() {
  const n = useMyNumbers();
  const { suggested, invited } = useImpactCounts();
  // Never show fewer suggestions than have already been asked.
  const total = Math.max(suggested ?? 0, n.askedQuestions);
  const waiting = suggested === null ? 0 : Math.max(0, suggested - n.askedQuestions);

  return (
    <div className="card">
      <h3>Your impact</h3>
      <div className="impact-list">
        <div>
          <span className="impact-icon">💡</span>
          <span className="grow">
            <b>
              {total} question{total === 1 ? "" : "s"} suggested
            </b>
            <span className="small muted">
              {n.askedQuestions
                ? `${n.askedQuestions} asked so far, ${n.answersToMyQuestions} answer${n.answersToMyQuestions === 1 ? "" : "s"} from others`
                : "Suggest one from any circle and it's asked next"}
              {waiting ? ` · ${waiting} waiting in the queue` : ""}
            </span>
          </span>
        </div>
        <div>
          <span className="impact-icon">❤️</span>
          <span className="grow">
            <b>
              {n.reactionsReceived} reaction{n.reactionsReceived === 1 ? "" : "s"} on your stories
            </b>
            <span className="small muted">From the people in your circles</span>
          </span>
        </div>
        <div>
          <span className="impact-icon">🤝</span>
          <span className="grow">
            <b>
              {invited === null ? "Invites" : `${invited} ${invited === 1 ? "person" : "people"} joined through you`}
            </b>
            <span className="small muted">
              {invited === null ? "Share your invite link above" : "Using your invite link"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
