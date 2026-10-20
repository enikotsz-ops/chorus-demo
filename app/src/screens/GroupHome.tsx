import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FeedbackSheet } from "../components/FeedbackSheet";
import { Icon } from "../components/Icon";
import { MemberStatus } from "../components/MemberStatus";
import { getGroup, getMembers, getRounds } from "../lib/api";
import { useUserId } from "../lib/auth";
import { formatDate, isUrgent, timeLeft } from "../lib/time";
import type { Member, Round } from "../lib/types";
import { usePoll } from "../lib/usePoll";

export function deadlineLabel(r: Round) {
  if (r.extensions_used === 3) return `Last chance · ${timeLeft(r.deadline)}`;
  if (r.extensions_used > 0) return `Extra time · ${timeLeft(r.deadline)}`;
  return timeLeft(r.deadline);
}

function RoundCard({ round, members, me }: { round: Round; members: Member[]; me: string }) {
  const navigate = useNavigate();
  const needsMe =
    round.status === "open" && round.participants.includes(me) && !round.answers.some((a) => a.user_id === me);
  return (
    <button className="card tappable" onClick={() => navigate(`/r/${round.id}`)}>
      <div className="card-meta">
        <span className="eyebrow">{round.question.theme}</span>
        {round.status === "open" ? (
          <span className={`deadline ${isUrgent(round.deadline) || round.extensions_used ? "urgent" : ""}`}>
            {deadlineLabel(round)}
          </span>
        ) : (
          <span className="deadline">{round.status === "unlocked" ? "Unlocked" : "Stayed locked"}</span>
        )}
      </div>
      <p className="question sm">{round.question.text}</p>
      <MemberStatus round={round} members={members} me={me} expandable={false} />
      {needsMe && (
        <span className="btn yellow block" role="presentation">
          <Icon name="mic" /> Record your answer
        </span>
      )}
      {round.status === "unlocked" && (
        <span className="btn primary block" role="presentation">
          <Icon name="play" /> Listen
        </span>
      )}
    </button>
  );
}

export function GroupHome() {
  const { groupId = "" } = useParams();
  const me = useUserId();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState(false);
  const load = useCallback(
    () => Promise.all([getGroup(groupId), getMembers(groupId), getRounds(groupId)]),
    [groupId],
  );
  const { data, error, refresh } = usePoll(load);

  if (error && !data) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="card empty">
          <h2>Couldn't load this group</h2>
          <p className="muted">Check your connection. If you were removed from the group, it won't be available any more.</p>
          <button className="btn primary" onClick={refresh}>
            Try again
          </button>
          <button className="link-btn" onClick={() => navigate("/")}>
            All groups
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="screen">
        <div className="skeleton" style={{ height: 52 }} />
        <div className="skeleton" style={{ height: 280 }} />
        <div className="skeleton" style={{ height: 120 }} />
      </div>
    );
  }

  const [group, members, rounds] = data;
  const answeredByMe = (r: Round) => r.answers.some((a) => a.user_id === me);
  const open = rounds
    .filter((r) => r.status === "open")
    // What needs you first, then the soonest deadline.
    .sort(
      (a, b) =>
        Number(answeredByMe(a) || !a.participants.includes(me)) - Number(answeredByMe(b) || !b.participants.includes(me)) ||
        a.deadline.localeCompare(b.deadline),
    );
  const twoWeeksAgo = Date.now() - 14 * 86400000;
  const recent = rounds.filter((r) => r.status === "unlocked" && new Date(r.unlocked_at!).getTime() > twoWeeksAgo);
  const nextRelease = group.next_release_at ? new Date(group.next_release_at) : null;

  return (
    <div className="screen">
      <div className="topbar">
        <button
          className="icon-btn"
          aria-label="All groups"
          onClick={() => {
            sessionStorage.setItem("chorus:stay-home", "1");
            navigate("/");
          }}
        >
          <Icon name="back" />
        </button>
        <span className="topbar-title">{group.name}</span>
        <Link to={`/g/${group.id}/settings`} className="icon-btn" aria-label="Group settings">
          <Icon name="settings" />
        </Link>
      </div>

      {members.length < 2 && (
        <div className="banner">
          <span style={{ flex: 1 }}>Chorus needs at least two voices. Invite someone so your first round can unlock.</span>
          <Link className="link-btn" to={`/g/${group.id}/settings?invite=1`}>
            Invite
          </Link>
        </div>
      )}

      {open.length > 0 ? (
        <>
          <span className="eyebrow">{open.length > 1 ? "Open questions" : "This week"}</span>
          {open.map((r) => (
            <RoundCard key={r.id} round={r} members={members} me={me} />
          ))}
        </>
      ) : (
        <div className="card empty">
          <span className="empty-icon">
            <Icon name="question" size={30} />
          </span>
          <h3>No open questions right now</h3>
          {nextRelease && (
            <p className="muted">
              The next one arrives {nextRelease.toLocaleDateString(undefined, { weekday: "long" })} at{" "}
              {nextRelease.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.
            </p>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <span className="eyebrow">Recently unlocked</span>
          {recent.map((r) => (
            <RoundCard key={r.id} round={r} members={members} me={me} />
          ))}
        </>
      )}

      <div className="spacer" />
      <div className="row" style={{ justifyContent: "center", gap: 24 }}>
        <Link to={`/g/${group.id}/archive`} className="btn ghost">
          <Icon name="archive" /> Archive
        </Link>
        <button className="btn ghost" onClick={() => setFeedback(true)}>
          <Icon name="chat" /> Feedback
        </button>
      </div>
      <p className="small muted" style={{ textAlign: "center" }}>
        Started {formatDate(rounds[rounds.length - 1]?.opens_at ?? new Date().toISOString())}
      </p>
      <FeedbackSheet open={feedback} onClose={() => setFeedback(false)} />
    </div>
  );
}
