import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { FeedbackSheet } from "../components/FeedbackSheet";
import { Icon } from "../components/Icon";
import { LaunchUpdatesCard } from "../components/LaunchUpdates";
import { MemberStatus } from "../components/MemberStatus";
import { SuggestSheet } from "../components/SuggestSheet";
import { buildActivity } from "../lib/activity";
import { getPendingSuggestions } from "../lib/api";
import { useAuth, useUserId } from "../lib/auth";
import { rememberCircle, useCircles } from "../lib/circles";
import { isUrgent, timeAgo, timeLeft } from "../lib/time";
import { questionLabel, type Member, type Question, type Round } from "../lib/types";

const releaseText = (d: Date) =>
  `${d.toLocaleDateString(undefined, { weekday: "long" })} at ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

export function deadlineLabel(r: Round) {
  if (r.extensions_used === 3) return `Last chance · ${timeLeft(r.deadline)}`;
  if (r.extensions_used > 0) return `Extra time · ${timeLeft(r.deadline)}`;
  return timeLeft(r.deadline);
}

function OpenQuestion({ round, members, me }: { round: Round; members: Member[]; me: string }) {
  const navigate = useNavigate();
  const needsMe = round.participants.includes(me) && !round.answers.some((a) => a.user_id === me);
  return (
    <button className="card tappable" onClick={() => navigate(`/r/${round.id}`)}>
      <div className="card-meta">
        <span className="pill">{questionLabel(round.question)}</span>
        <span className={`deadline ${isUrgent(round.deadline) || round.extensions_used ? "urgent" : ""}`}>
          {deadlineLabel(round)}
        </span>
      </div>
      <p className="question sm">{round.question.text}</p>
      <MemberStatus round={round} members={members} me={me} expandable={false} />
      {needsMe ? (
        <span className="btn yellow block" role="presentation">
          <Icon name="mic" /> Record your answer
        </span>
      ) : (
        <span className="small muted">Your answer is locked in. We'll let you know when it unlocks.</span>
      )}
    </button>
  );
}

/** One circle: its open question(s), then everything that's happened lately. */
export function GroupHome() {
  const { groupId = "" } = useParams();
  const me = useUserId();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { loading, circles, rounds: allRounds, members: allMembers, refresh } = useCircles();
  const [feedback, setFeedback] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [pending, setPending] = useState<Question[]>([]);
  const loadPending = useCallback(() => {
    getPendingSuggestions(groupId)
      .then(setPending)
      .catch(() => {});
  }, [groupId]);

  useEffect(() => {
    rememberCircle(groupId);
    refresh();
    loadPending();
  }, [groupId, refresh, loadPending]);

  const circle = circles.find((c) => c.id === groupId);
  if (!circle) {
    if (loading) {
      return (
        <div className="screen with-tabs">
          <div className="skeleton" style={{ height: 52 }} />
          <div className="skeleton" style={{ height: 280 }} />
        </div>
      );
    }
    return (
      <div className="screen with-tabs" style={{ justifyContent: "center" }}>
        <div className="card empty">
          <h2>Couldn't load this circle</h2>
          <p className="muted">Check your connection. If you were removed from the circle, it won't be available any more.</p>
          <button className="btn primary" onClick={refresh}>
            Try again
          </button>
          <button className="link-btn" onClick={() => navigate("/")}>
            Your circles
          </button>
        </div>
      </div>
    );
  }

  const rounds = allRounds.filter((r) => r.group_id === groupId);
  const members = allMembers.filter((m) => m.group_id === groupId);
  const answeredByMe = (r: Round) => r.answers.some((a) => a.user_id === me);
  const open = rounds
    .filter((r) => r.status === "open")
    // What needs you first, then the soonest deadline.
    .sort(
      (a, b) =>
        Number(answeredByMe(a) || !a.participants.includes(me)) - Number(answeredByMe(b) || !b.participants.includes(me)) ||
        a.deadline.localeCompare(b.deadline),
    );
  const activity = buildActivity(rounds, members, me);
  const nextRelease = circle.next_release_at ? new Date(circle.next_release_at) : null;
  const upNext = pending[0];

  return (
    <div className="screen with-tabs">
      <div className="topbar">
        <button className="icon-btn" aria-label="Your circles" onClick={() => navigate("/")}>
          <Icon name="back" />
        </button>
        <span className="topbar-title">{circle.name}</span>
        <Link to={`/g/${circle.id}/settings`} className="icon-btn" aria-label="Circle settings">
          <Icon name="settings" />
        </Link>
      </div>

      {members.length < 2 && (
        <div className="banner">
          <span style={{ flex: 1 }}>Chorus needs at least two voices. Invite someone so your first round can unlock.</span>
          <Link className="link-btn" to={`/g/${circle.id}/settings?invite=1`}>
            Invite
          </Link>
        </div>
      )}

      <button className="list-item suggest-top" onClick={() => setSuggest(true)}>
        <span className="empty-icon" style={{ width: 40, height: 40, borderRadius: 12, flex: "none" }}>
          <Icon name="plus" size={20} />
        </span>
        <span className="grow">
          <b>Suggest a question</b>
          <span className="small muted" style={{ display: "block" }}>
            It's queued as the next question, with your name on it.
          </span>
        </span>
        <Icon name="chevron" />
      </button>

      {upNext && (
        <div className="card quiet next-up">
          <span className="eyebrow">Next up{nextRelease ? ` · ${releaseText(nextRelease)}` : ""}</span>
          <p className="question sm">{upNext.text}</p>
          <span className="small muted">
            {upNext.suggested_by_name} asks
            {pending.length > 1 ? ` · ${pending.length - 1} more suggestion${pending.length > 2 ? "s" : ""} queued` : ""}
          </span>
        </div>
      )}

      {open.length > 0 ? (
        open.map((r) => <OpenQuestion key={r.id} round={r} members={members} me={me} />)
      ) : (
        <div className="card empty">
          <span className="empty-icon">
            <Icon name="question" size={30} />
          </span>
          <h3>No open questions right now</h3>
          {nextRelease && (
            <p className="muted">
              The next one arrives {releaseText(nextRelease)}.
            </p>
          )}
        </div>
      )}


      <span className="eyebrow">Activity</span>
      {activity.length === 0 ? (
        <p className="small muted">Nothing yet. Answers, unlocks, reactions and comments will show up here.</p>
      ) : (
        <div className="card activity">
          {activity.map((a) => (
            <button key={a.key} className="act" onClick={() => navigate(`/r/${a.roundId}`)}>
              {a.who ? <Avatar id={a.who} name={a.name === "You" ? profile?.display_name : a.name} size={36} /> : <span className="act-icon">{a.icon}</span>}
              <span className="act-text">
                {a.name && <b>{a.name} </b>}
                {a.text}
                <span className="act-when">{timeAgo(a.at)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {profile?.launch_updates === null && <LaunchUpdatesCard compact />}

      <div className="card quiet">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <span className="empty-icon" style={{ width: 44, height: 44, borderRadius: 14, flex: "none" }}>
            <Icon name="chat" size={22} />
          </span>
          <div style={{ flex: 1 }}>
            <h3>Chorus is in early testing</h3>
            <p className="small muted">Anything confusing, broken or missing? Tell us. It takes ten seconds.</p>
          </div>
        </div>
        <button className="btn secondary block" onClick={() => setFeedback(true)}>
          Share feedback
        </button>
      </div>

      <FeedbackSheet open={feedback} onClose={() => setFeedback(false)} />
      <SuggestSheet
        open={suggest}
        onClose={() => {
          setSuggest(false);
          loadPending();
        }}
        groupId={circle.id}
        isAdmin={circle.role === "admin"}
      />
    </div>
  );
}
