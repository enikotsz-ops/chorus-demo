import { useState } from "react";
import { useLocation } from "react-router-dom";
import { sendFeedback } from "../lib/api";
import { useUserId } from "../lib/auth";
import { Sheet } from "./Sheet";
import { useToast } from "./Toast";

export function FeedbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const userId = useUserId();
  const toast = useToast();
  const { pathname } = useLocation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendFeedback(userId, text.trim(), pathname);
      setText("");
      onClose();
      toast("Thank you. We read every message.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <h3>Send feedback</h3>
      <p className="muted small">What's working, what's confusing, what you wish Chorus did. It goes straight to the team.</p>
      <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us anything" maxLength={4000} />
      {error && <p className="error-text">{error}</p>}
      <button className="btn primary block" disabled={!text.trim() || busy} onClick={send}>
        {busy ? "Sending…" : "Send"}
      </button>
    </Sheet>
  );
}
