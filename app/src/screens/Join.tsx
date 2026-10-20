import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { groupPreview, joinGroup } from "../lib/api";
import { useAuth } from "../lib/auth";

export const PENDING_INVITE = "chorus:invite";

/** Invite landing page. Signed-out visitors sign in first, then come back here. */
export function Join() {
  const { code = "" } = useParams();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<{ name: string; member_count: number } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    groupPreview(code)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [code]);

  const join = async () => {
    if (!userId) {
      localStorage.setItem(PENDING_INVITE, code);
      navigate("/");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const gid = await joinGroup(code);
      localStorage.removeItem(PENDING_INVITE);
      navigate(`/g/${gid}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (preview === undefined) {
    return (
      <div className="screen">
        <div className="skeleton" style={{ height: 240, marginTop: 60 }} />
      </div>
    );
  }

  if (preview === null) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="card empty">
          <h2>This invite doesn't work</h2>
          <p className="muted">The link may be mistyped, or the circle may have been removed. Ask for a fresh link.</p>
          <button className="btn secondary" onClick={() => navigate("/")}>
            Go to Chorus
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen" style={{ justifyContent: "space-between" }}>
      <div className="stack" style={{ gap: 16, marginTop: 40 }}>
        <span className="eyebrow">You're invited</span>
        <h1>Join {preview.name} on Chorus</h1>
        <p className="muted">
          {preview.member_count} {preview.member_count === 1 ? "person is" : "people are"} already here. Each week you'll all
          answer the same question by voice, and hear each other once everyone has answered.
        </p>
      </div>
      <div className="stack">
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary block" onClick={join} disabled={busy}>
          {busy ? "Joining…" : userId ? "Join the circle" : "Sign in to join"}
        </button>
      </div>
    </div>
  );
}
