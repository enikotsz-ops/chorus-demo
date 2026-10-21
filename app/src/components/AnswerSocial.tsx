import { useEffect, useState } from "react";
import { addComment, deleteComment, setReaction } from "../lib/api";
import { timeAgo } from "../lib/time";
import { REACTIONS, type Answer, type Member, type Reaction } from "../lib/types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

/** Emoji reactions and a text comment thread under one unlocked voice answer. */
export function AnswerSocial({
  answer,
  members,
  me,
  onChanged,
}: {
  answer: Answer;
  members: Member[];
  me: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  // Local copy so taps feel instant; resyncs when the round reloads.
  const [reactions, setReactions] = useState<Reaction[]>(answer.reactions);
  const [picking, setPicking] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => setReactions(answer.reactions), [answer.reactions]);

  const nameOf = (uid: string) => members.find((m) => m.user_id === uid)?.profile?.display_name ?? "Former member";

  const toggle = async (emoji: string) => {
    const on = !reactions.some((r) => r.emoji === emoji && r.user_id === me);
    setReactions((rs) => (on ? [...rs, { emoji, user_id: me }] : rs.filter((r) => !(r.emoji === emoji && r.user_id === me))));
    setPicking(false);
    navigator.vibrate?.(8);
    try {
      await setReaction(answer.id, me, emoji, on);
      onChanged();
    } catch (e) {
      setReactions(answer.reactions);
      toast(`Couldn't save that reaction. (${(e as Error).message})`);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await addComment(answer.id, me, body);
      setDraft("");
      onChanged();
    } catch (e) {
      toast(`Couldn't post your comment. (${(e as Error).message})`);
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteComment(id);
      onChanged();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const counts = REACTIONS.map((emoji) => ({
    emoji,
    count: reactions.filter((r) => r.emoji === emoji).length,
    mine: reactions.some((r) => r.emoji === emoji && r.user_id === me),
    who: reactions.filter((r) => r.emoji === emoji).map((r) => nameOf(r.user_id)),
  })).filter((c) => c.count > 0);

  const comments = answer.comments;
  const speaker = answer.user_id ? nameOf(answer.user_id) : answer.speaker_name ?? "this answer";

  return (
    <div className="social">
      <div className="reaction-row">
        {counts.map((c) => (
          <button
            key={c.emoji}
            className={`reaction-chip ${c.mine ? "mine" : ""}`}
            onClick={() => toggle(c.emoji)}
            aria-pressed={c.mine}
            aria-label={`${c.emoji} from ${c.who.join(", ")}`}
            title={c.who.join(", ")}
          >
            <span>{c.emoji}</span>
            <span className="reaction-count">{c.count}</span>
          </button>
        ))}
        <button className="reaction-chip add" onClick={() => setPicking(!picking)} aria-expanded={picking} aria-label="Add a reaction">
          <span className="add-emoji" aria-hidden="true">
            🙂
          </span>
          <Icon name="plus" size={14} />
        </button>
        <button className="reaction-chip comment-toggle" onClick={() => setThreadOpen(!threadOpen)} aria-expanded={threadOpen}>
          <Icon name="chat" size={16} />
          <span>{comments.length ? `${comments.length}` : "Comment"}</span>
        </button>
      </div>

      {picking && (
        <div className="reaction-picker" role="group" aria-label="Pick a reaction">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => toggle(emoji)}
              aria-pressed={reactions.some((r) => r.emoji === emoji && r.user_id === me)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {threadOpen && (
        <div className="thread">
          {comments.length === 0 && <p className="small muted">No comments yet. Say what this answer meant to you.</p>}
          {comments.map((c) => (
            <div className="comment" key={c.id}>
              <Avatar id={c.user_id} name={nameOf(c.user_id)} size={30} />
              <div className="comment-body">
                <div className="comment-meta">
                  <b>{nameOf(c.user_id)}</b> <span className="muted">· {timeAgo(c.created_at)}</span>
                </div>
                <p>{c.body}</p>
              </div>
              {c.user_id === me && (
                <button className="comment-delete" onClick={() => remove(c.id)} aria-label="Delete your comment">
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          ))}
          <form
            className="comment-form"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              className="input"
              placeholder={`Reply to ${speaker}…`}
              value={draft}
              maxLength={1000}
              onChange={(e) => setDraft(e.target.value)}
              enterKeyHint="send"
            />
            <button className="btn primary" disabled={!draft.trim() || sending} aria-label="Post comment">
              {sending ? "…" : "Post"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
