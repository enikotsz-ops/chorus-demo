import { useEffect, useState } from "react";
import { deleteSuggestion, getPendingSuggestions, suggestQuestion } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Question } from "../lib/types";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { useToast } from "./Toast";

/** Suggest a question for this circle. No approval: it's queued next, credited to whoever asked. */
export function SuggestSheet({
  open,
  onClose,
  groupId,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  isAdmin: boolean;
}) {
  const { userId, profile } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<Question[] | null>(null);

  const load = () =>
    getPendingSuggestions(groupId)
      .then(setQueued)
      .catch(() => setQueued([]));

  useEffect(() => {
    if (open) {
      setError(null);
      load();
    }
  }, [open, groupId]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await suggestQuestion(groupId, text.trim());
      setText("");
      toast("Added. It'll be one of the next questions.");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteSuggestion(id);
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const length = text.trim().length;

  return (
    <Sheet open={open} onClose={onClose}>
      <h3>Suggest a question</h3>
      <p className="muted small">
        It goes to the front of the queue for this circle, shown as <b>"{profile?.display_name ?? "You"} asks"</b>. Personal
        ones work well, like "What did you learn from me?"
      </p>
      <textarea
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What would you love to hear everyone answer?"
        maxLength={200}
        style={{ minHeight: 90 }}
      />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small muted">{length}/200</span>
        {error && <span className="error-text">{error}</span>}
      </div>
      <button className="btn primary block" disabled={length < 5 || busy} onClick={send}>
        {busy ? "Adding…" : "Add to the queue"}
      </button>

      {queued && queued.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Coming up</span>
          {queued.map((q, i) => (
            <div key={q.id} className="list-item" style={{ background: "var(--paper)", cursor: "default" }}>
              <span className="grow">
                <span style={{ display: "block", fontWeight: 600 }}>{q.text}</span>
                <span className="small muted">
                  {i === 0 ? "Next · " : ""}
                  {q.suggested_by_name} asks
                </span>
              </span>
              {(q.suggested_by === userId || isAdmin) && (
                <button className="comment-delete" onClick={() => remove(q.id)} aria-label="Remove suggestion">
                  <Icon name="trash" size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
