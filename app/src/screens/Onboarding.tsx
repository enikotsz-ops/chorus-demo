import { useState } from "react";
import { NotificationsCard } from "../components/NotificationsCard";
import { saveProfile } from "../lib/api";
import { useAuth } from "../lib/auth";
import { browserTimezone } from "../lib/time";

/** First run: what to call you, then reminders (with the iPhone install step). */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { userId, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(profile?.display_name ? 1 : 0);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveName = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveProfile(userId!, { display_name: name.trim(), timezone: browserTimezone() });
      await refreshProfile();
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="steps" aria-hidden="true">
        <span className={step === 0 ? "on" : ""} />
        <span className={step === 1 ? "on" : ""} />
      </div>

      {step === 0 ? (
        <>
          <div className="stack" style={{ gap: 16, marginTop: 24 }}>
            <h1>What should your group call you?</h1>
            <p className="muted">This is how you'll appear next to your answers, like Mum, Dad or Leo.</p>
            <input
              className="input"
              autoFocus
              autoComplete="given-name"
              placeholder="Your name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {error && <p className="error-text">{error}</p>}
          </div>
          <div className="spacer" />
          <button className="btn primary block" disabled={!name.trim() || busy} onClick={saveName}>
            {busy ? "Saving…" : "Continue"}
          </button>
        </>
      ) : (
        <>
          <div className="stack" style={{ gap: 16, marginTop: 24 }}>
            <h1>Never miss a question</h1>
            <p className="muted">Questions arrive in the evening, and your group can't hear anything until you've answered.</p>
            <NotificationsCard />
          </div>
          <div className="spacer" />
          <button className="btn primary block" onClick={onDone}>
            Continue
          </button>
        </>
      )}
    </div>
  );
}
