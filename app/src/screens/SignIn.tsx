import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/** Email sign-in. The email has a link and a code; the code matters on iPhone,
 * where a Home Screen app can't pick up a link opened in Safari. */
export function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const t = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + "/" },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("code");
    setCooldown(60);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError("That code didn't work. Check the latest email, or send a new one.");
  };

  return (
    <div className="screen" style={{ justifyContent: "space-between" }}>
      <div className="stack" style={{ gap: 20, marginTop: 40 }}>
        <span className="eyebrow">Know your people</span>
        <p className="hero">
          One question.
          <br />A memory.
          <br />
          <b>
            Collect the stories.
            <br />
            Keep them forever.
          </b>
        </p>
        <p className="muted">Each week your group answers the same question by voice. Nobody hears anything until everyone has answered.</p>
      </div>

      {step === "email" ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="field">
            <label htmlFor="email">Your email</label>
            <input
              id="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn primary block" disabled={busy || !email.includes("@")}>
            {busy ? "Sending…" : "Continue"}
          </button>
          <p className="small muted center" style={{ textAlign: "center" }}>
            No password needed. We'll email you a sign-in code.
          </p>
        </form>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <h2>Check your email</h2>
          <p className="muted">
            We sent a code to <b>{email}</b>. Enter it below, or tap the link in the email.
          </p>
          <input
            className="input code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-label="Sign-in code"
          />
          {error && <p className="error-text">{error}</p>}
          <button className="btn primary block" disabled={busy || code.length < 6}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="link-btn" onClick={() => setStep("email")}>
              Use another email
            </button>
            <button type="button" className="link-btn" onClick={send} disabled={cooldown > 0 || busy}>
              {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
