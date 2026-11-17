import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleTypePicker } from "../components/CircleTypePicker";
import { Icon } from "../components/Icon";
import { createGroup } from "../lib/api";
import { useCircles } from "../lib/circles";
import { browserTimezone, describeSchedule, formatHour } from "../lib/time";
import type { CircleType } from "../lib/types";

export function NewGroup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [qpw, setQpw] = useState(1);
  const [type, setType] = useState<CircleType>("family");
  const { refresh } = useCircles();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await createGroup(name.trim(), qpw, 18, browserTimezone(), type);
      await refresh();
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
        <div className="stack" style={{ gap: 6 }}>
          <h2>Who is this circle for?</h2>
          <p className="small muted">
            We'll pick questions that suit them, e.g. "What is one thing you learned from someone in this circle?" You
            can change this later.
          </p>
        </div>
        <CircleTypePicker value={type} onChange={setType} />

        <div className="field">
          <label htmlFor="gname">Circle name</label>
          <input
            id="gname"
            className="input"
            placeholder={type === "family" ? "The Smiths, Mum's side…" : "Uni friends, The book club…"}
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Questions per week</label>
          <div className="segmented" role="group">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button key={n} aria-pressed={qpw === n} onClick={() => setQpw(n)}>
                {n}
              </button>
            ))}
          </div>
          <p className="small muted">
            {describeSchedule(qpw).days}, at {formatHour(18)}. {describeSchedule(qpw).window}. You can change this
            later.
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
