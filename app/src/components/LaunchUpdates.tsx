import { useState } from "react";
import { setLaunchUpdates } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Icon } from "./Icon";

/** Opt-in for launch news. Unticked by default; the choice and its time are stored. */
export function LaunchUpdatesCard({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const { userId, session, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (yes: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setLaunchUpdates(userId!, yes);
      await refreshProfile();
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="card launch-card">
      <span className="pill">Early tester</span>
      {compact ? <h3>Be first to hear when Chorus launches</h3> : <h1>You're one of the first to try Chorus</h1>}
      <p className={compact ? "small" : undefined}>
        This is an early version, and you're helping shape it. Want us to email you when the full Chorus app launches?
      </p>
      <p className="small muted">
        We'll only email <b>{session?.user.email}</b> about the launch, and you can change your mind any time in Settings.
      </p>
      {error && <p className="error-text">{error}</p>}
      <button className="btn primary block" onClick={() => answer(true)} disabled={busy}>
        <Icon name="bell" /> Yes, keep me posted
      </button>
      <button className="btn ghost block" onClick={() => answer(false)} disabled={busy}>
        Not now
      </button>
    </div>
  );
}
