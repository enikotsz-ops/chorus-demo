import { useCallback } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { myGroups } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePoll } from "../lib/usePoll";

export function Home() {
  const { userId, profile } = useAuth();
  const navigate = useNavigate();
  const load = useCallback(() => myGroups(userId!), [userId]);
  const { data: groups, error, refresh } = usePoll(load, 60000);

  // Most people have one group: go straight there.
  if (groups?.length === 1 && !sessionStorage.getItem("chorus:stay-home")) {
    return <Navigate to={`/g/${groups[0].id}`} replace />;
  }

  return (
    <div className="screen">
      <div className="topbar">
        <span className="eyebrow">Chorus</span>
        <Link to="/settings" className="icon-btn" aria-label="Settings">
          <Icon name="settings" />
        </Link>
      </div>
      <h1>Hi {profile?.display_name}</h1>

      {error && (
        <div className="banner warn">
          <span style={{ flex: 1 }}>Couldn't load your groups.</span>
          <button className="link-btn" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      {!groups && !error && (
        <div className="stack">
          <div className="skeleton" style={{ height: 72 }} />
          <div className="skeleton" style={{ height: 72 }} />
        </div>
      )}

      {groups?.length === 0 && (
        <div className="card empty">
          <span className="empty-icon">
            <Icon name="mic" size={30} />
          </span>
          <h2>Start your first group</h2>
          <p className="muted">
            Invite your family or close friends. Every week you'll all answer the same question, and hear each other once
            everyone has.
          </p>
        </div>
      )}

      {groups && groups.length > 0 && (
        <div className="stack">
          {groups.map((g) => (
            <Link key={g.id} to={`/g/${g.id}`} className="list-item">
              <div className="grow">
                <h3>{g.name}</h3>
                <span className="small muted">{g.role === "admin" ? "You run this group" : "Member"}</span>
              </div>
              <Icon name="chevron" />
            </Link>
          ))}
        </div>
      )}

      <div className="spacer" />
      <div className="stack">
        <button className="btn primary block" onClick={() => navigate("/new")}>
          <Icon name="plus" /> Create a group
        </button>
        <p className="small muted" style={{ textAlign: "center" }}>
          Joining someone else's group? Open the invite link they sent you.
        </p>
      </div>
    </div>
  );
}
