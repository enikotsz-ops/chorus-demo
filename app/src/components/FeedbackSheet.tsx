import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { sendFeedback } from "../lib/api";
import { useUserId } from "../lib/auth";
import { Sheet } from "./Sheet";
import { useToast } from "./Toast";

const MOODS = [
  { value: 1, emoji: "😕", label: "Not great" },
  { value: 2, emoji: "🙂", label: "It's OK" },
  { value: 3, emoji: "😍", label: "Love it" },
];

export function FeedbackSheet({
  open,
  onClose,
  context = "general",
  title = "Send feedback",
  prompt = "What's working, what's confusing, what you wish Chorus did. It goes straight to the team.",
}: {
  open: boolean;
  onClose: () => void;
  /** Where it was asked, e.g. "after-first-answer", so feedback can be grouped */
  context?: string;
  title?: string;
  prompt?: string;
}) {
  const userId = useUserId();
  const toast = useToast();
  const { pathname } = useLocation();
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRating(null);
      setError(null);
    }
  }, [open]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendFeedback(userId, { message: text.trim(), rating: rating ?? undefined, context, page: pathname });
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
      <h3>{title}</h3>
      <p className="muted small">{prompt}</p>
      <div className="moods" role="group" aria-label="How do you feel about it?">
        {MOODS.map((m) => (
          <button key={m.value} aria-pressed={rating === m.value} onClick={() => setRating(rating === m.value ? null : m.value)}>
            <span className="mood-emoji" aria-hidden="true">
              {m.emoji}
            </span>
            {m.label}
          </button>
        ))}
      </div>
      <textarea
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Tell us more (optional)"
        maxLength={4000}
      />
      {error && <p className="error-text">{error}</p>}
      <button className="btn primary block" disabled={(!text.trim() && rating === null) || busy} onClick={send}>
        {busy ? "Sending…" : "Send"}
      </button>
    </Sheet>
  );
}
