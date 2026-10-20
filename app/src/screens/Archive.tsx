import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { getRounds } from "../lib/api";
import { formatDate } from "../lib/time";
import { usePoll } from "../lib/usePoll";

export function Archive() {
  const { groupId = "" } = useParams();
  const navigate = useNavigate();
  const load = useCallback(() => getRounds(groupId), [groupId]);
  const { data: rounds, error, refresh } = usePoll(load, 60000);
  const closed = rounds?.filter((r) => r.status !== "open") ?? [];

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={() => navigate(`/g/${groupId}`)} aria-label="Back">
          <Icon name="back" />
        </button>
        <span className="topbar-title">Archive</span>
        <span style={{ width: 52 }} />
      </div>

      {error && !rounds && (
        <div className="banner warn">
          <span style={{ flex: 1 }}>Couldn't load the archive.</span>
          <button className="link-btn" onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      {!rounds && !error && <div className="skeleton" style={{ height: 200 }} />}

      {rounds && closed.length === 0 && (
        <div className="card empty">
          <span className="empty-icon">
            <Icon name="archive" size={30} />
          </span>
          <h3>Nothing here yet</h3>
          <p className="muted">Every finished round is kept here, so you can come back to those voices any time.</p>
        </div>
      )}

      <div className="stack">
        {closed.map((r) => (
          <Link key={r.id} to={`/r/${r.id}`} className="list-item">
            <span className="empty-icon" style={{ width: 44, height: 44, borderRadius: 14, background: r.status === "unlocked" ? "var(--yellow)" : "var(--line)", flex: "none" }}>
              <Icon name={r.status === "unlocked" ? "play" : "lock"} size={20} />
            </span>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{r.question.text}</div>
              <div className="small muted">
                {formatDate(r.opens_at)} · {r.status === "unlocked" ? `${r.answers.length} voices` : "Stayed locked"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
