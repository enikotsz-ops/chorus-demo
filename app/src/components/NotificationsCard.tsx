import { useState } from "react";
import { useUserId } from "../lib/auth";
import { enablePush, isIOS, pushState, type PushState } from "../lib/push";
import { Icon } from "./Icon";

/** Explains and requests push permission, including the iPhone Home Screen step. */
export function NotificationsCard() {
  const userId = useUserId();
  const [state, setState] = useState<PushState>(pushState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await enablePush(userId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (state === "granted") {
    return (
      <div className="banner">
        <Icon name="check" />
        <span>Reminders are on. We'll let you know when a new question arrives and when your round unlocks.</span>
      </div>
    );
  }

  if (state === "needs-install") {
    return (
      <div className="panel stack">
        <h3>Add Chorus to your Home Screen</h3>
        <p className="muted small">On iPhone, reminders only work once Chorus is on your Home Screen.</p>
        <ol className="small" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          <li>
            Tap the <b>Share</b> button in Safari <Icon name="share" size={16} />
          </li>
          <li>
            Choose <b>Add to Home Screen</b>
          </li>
          <li>Open Chorus from your Home Screen and turn on reminders</li>
        </ol>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="banner warn">
        <Icon name="bell" />
        <span>
          Notifications are blocked. Turn them on for Chorus in your {isIOS() ? "iPhone Settings" : "browser settings"} to
          get reminders.
        </span>
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div className="banner">
        <Icon name="bell" />
        <span>This browser doesn't support reminders. You can still answer from the app any time.</span>
      </div>
    );
  }

  return (
    <div className="panel stack">
      <h3>Turn on reminders</h3>
      <p className="muted small">A nudge when a new question arrives, when time is running out, and when your round unlocks.</p>
      {error && <p className="error-text">{error}</p>}
      <button className="btn yellow block" onClick={enable} disabled={busy}>
        <Icon name="bell" /> {busy ? "Turning on…" : "Turn on reminders"}
      </button>
    </div>
  );
}
