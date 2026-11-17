import { Link, useNavigate } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { buildActivity } from "../lib/activity";
import { useUserId } from "../lib/auth";
import { useCircles } from "../lib/circles";
import { timeAgo } from "../lib/time";

/** Circles tab: every circle I'm in, with what needs me and what's new. */
export function Home() {
  const me = useUserId();
  const navigate = useNavigate();
  const { loading, error, circles, rounds, members, waiting, refresh } = useCircles();

  return (
    <div className="screen with-tabs">
      <h1 style={{ marginTop: 20 }}>Your circles</h1>

      {error && !circles.length && (
        <div className="banner warn">
          <span style={{ flex: 1 }}>Couldn't load your circles.</span>
          <button className="link-btn" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      {loading && (
        <div className="stack">
          <div className="skeleton" style={{ height: 150 }} />
          <div className="skeleton" style={{ height: 150 }} />
        </div>
      )}

      {!loading && circles.length === 0 && !error && (
        <div className="card empty">
          <span className="empty-icon">
            <Icon name="mic" size={30} />
          </span>
          <h2>Start your first circle</h2>
          <p className="muted">
            Invite your family or close friends. You'll all answer the same question by voice, and hear each other once
            everyone has.
          </p>
        </div>
      )}

      {circles.map((c) => {
        const cRounds = rounds.filter((r) => r.group_id === c.id);
        const cMembers = members.filter((m) => m.group_id === c.id);
        const myWaiting = waiting.filter((r) => r.group_id === c.id).length;
        const recentUnlock = cRounds.find(
          (r) => r.status === "unlocked" && r.unlocked_at && Date.now() - new Date(r.unlocked_at).getTime() < 3 * 86400000,
        );
        const latest = buildActivity(cRounds, cMembers, me, 1)[0];
        return (
          <button key={c.id} className="circle-card" onClick={() => navigate(`/g/${c.id}`)}>
            <div className="circle-top">
              <Avatar id={c.id} name={c.name} size={48} />
              <div className="grow">
                <h3>{c.name}</h3>
                <span className="small muted">
                  {cMembers.length} {cMembers.length === 1 ? "member" : "members"} ·{" "}
                  {c.circle_type === "friends" ? "friends" : "family"} ·{" "}
                  {c.questions_per_week === 7 ? "daily" : `${c.questions_per_week}× a week`}
                </span>
              </div>
              <Icon name="chevron" />
            </div>
            <div className="circle-status">
              {myWaiting > 0 ? (
                <span className="badge">
                  <Icon name="mic" size={16} /> {myWaiting === 1 ? "1 question waiting on you" : `${myWaiting} questions waiting on you`}
                </span>
              ) : recentUnlock ? (
                <span className="badge quiet">🔓 Round unlocked · listen now</span>
              ) : (
                <span className="badge quiet">All caught up</span>
              )}
              <span className="avatar-stack">
                {cMembers.slice(0, 4).map((m) => (
                  <Avatar key={m.user_id} id={m.user_id} name={m.profile?.display_name} size={30} />
                ))}
              </span>
            </div>
            {latest && (
              <span className="small muted latest">
                {latest.name ? `${latest.name} ` : ""}
                {latest.text} · {timeAgo(latest.at)}
              </span>
            )}
          </button>
        );
      })}

      <Link to="/new" className="btn secondary block dashed">
        <Icon name="plus" /> Create a circle
      </Link>
      <p className="small muted" style={{ textAlign: "center" }}>
        Joining someone else's circle? Open the invite link they sent you.
      </p>
    </div>
  );
}
