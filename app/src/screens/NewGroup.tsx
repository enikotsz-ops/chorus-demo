import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { createGroup } from "../lib/api";
import { browserTimezone, formatHour } from "../lib/time";

export function NewGroup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [qpw, setQpw] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await createGroup(name.trim(), qpw, 18, browserTimezone());
      navigate(`/g/${id}/settings?invite=1`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          <Icon name="back" />
        </button>
        <span className="topbar-title">New circle</span>
        <span style={{ width: 52 }} />
      </div>

      <div className="stack" style={{ gap: 20 }}>
        <div className="field">
          <label htmlFor="gname">Circle name</label>
          <input
            id="gname"
            className="input"
            placeholder="The Smiths, Uni friends…"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Questions per week</label>
          <div className="segmented" role="group">
            {[1, 2, 3].map((n) => (
              <button key={n} aria-pressed={qpw === n} onClick={() => setQpw(n)}>
                {n}
              </button>
            ))}
          </div>
          <p className="small muted">
            {qpw === 1 && "A new question every Monday."}
            {qpw === 2 && "New questions on Monday and Thursday."}
            {qpw === 3 && "New questions on Monday, Wednesday and Friday."} They arrive at {formatHour(18)}. You can change
            this later.
          </p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="spacer" />
      <button className="btn primary block" disabled={!name.trim() || busy} onClick={create}>
        {busy ? "Creating…" : "Create circle"}
      </button>
    </div>
  );
}
