import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnswerPlayer } from "../components/AnswerPlayer";
import { Icon } from "../components/Icon";
import { MemberStatus } from "../components/MemberStatus";
import { RecorderDock } from "../components/RecorderDock";
import { Confirm } from "../components/Sheet";
import { useToast } from "../components/Toast";
import { getGroup, getMembers, getRound, hasUnlockInterest, registerUnlockInterest, shuffleQuestion } from "../lib/api";
import { useUserId } from "../lib/auth";
import { formatDate, isUrgent } from "../lib/time";
import { usePoll } from "../lib/usePoll";
import { deadlineLabel } from "./GroupHome";

export function RoundScreen() {
  const { roundId = "" } = useParams();
  const me = useUserId();
  const navigate = useNavigate();
  const toast = useToast();
  const [shuffling, setShuffling] = useState(false);
  const [confirmShuffle, setConfirmShuffle] = useState(false);
  const [interest, setInterest] = useState(false);

  const load = useCallback(async () => {
    const round = await getRound(roundId);
    const [group, members] = await Promise.all([getGroup(round.group_id), getMembers(round.group_id)]);
    return { round, group, members };
  }, [roundId]);
  const { data, error, refresh } = usePoll(load, 15000);

  useEffect(() => {
    if (data?.round.status === "expired") hasUnlockInterest(roundId, me).then(setInterest).catch(() => {});
  }, [data?.round.status, roundId, me]);

  if (error && !data) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="card empty">
          <h2>Couldn't load this question</h2>
          <p className="muted">Check your connection and try again.</p>
          <button className="btn primary" onClick={refresh}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="screen">
        <div className="skeleton" style={{ height: 52 }} />
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  const { round, group, members } = data;
  const isParticipant = round.participants.includes(me);
  const myAnswer = round.answers.find((a) => a.user_id === me);
  const canRecord = round.status === "open" && isParticipant && !myAnswer;
  const canShuffle = round.status === "open" && round.answers.length === 0 && isParticipant;

  const shuffle = async () => {
    setConfirmShuffle(false);
    setShuffling(true);
    try {
      await shuffleQuestion(round.id);
      await refresh();
    } catch (e) {
      toast((e as Error).message);
      refresh();
    } finally {
      setShuffling(false);
    }
  };

  const nudge = async () => {
    const text = `I've answered this week's question on Chorus: "${round.question.text}" Your turn, so we can all hear each other.`;
    const url = `${window.location.origin}/r/${round.id}`;
    try {
      if (navigator.share) await navigator.share({ text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast("Copied. Paste it into your group chat.");
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  const wantUnlock = async () => {
    try {
      await registerUnlockInterest(round.id, me);
      setInterest(true);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className={`screen ${canRecord ? "with-dock" : ""}`}>
      <div className="topbar">
        <button className="icon-btn" onClick={() => navigate(`/g/${group.id}`)} aria-label="Back to group">
          <Icon name="back" />
        </button>
        <span className="topbar-title">{group.name}</span>
        <span style={{ width: 52 }} />
      </div>

      <div className="card">
        <div className="card-meta">
          <span className="pill">{round.question.theme}</span>
          {round.status === "open" ? (
            <span className={`deadline ${isUrgent(round.deadline) || round.extensions_used ? "urgent" : ""}`}>
              {deadlineLabel(round)}
            </span>
          ) : (
            <span className="deadline">{formatDate(round.opens_at)}</span>
          )}
        </div>
        <p className="question" style={{ opacity: shuffling ? 0.3 : 1, transition: "opacity .2s" }}>
          {round.question.text}
        </p>
        <MemberStatus round={round} members={members} me={me} />
        {canShuffle && (
          <button className="btn secondary" style={{ background: "var(--paper)" }} onClick={() => setConfirmShuffle(true)} disabled={shuffling}>
            <Icon name="shuffle" size={20} /> {shuffling ? "Finding one…" : "New question"}
          </button>
        )}
      </div>

      {round.status === "open" && !isParticipant && (
        <div className="banner">
          <Icon name="lock" />
          <span>You joined after this round started. Your first question is the next one.</span>
        </div>
      )}

      {round.status === "open" && myAnswer && (
        <div className="card quiet">
          <div className="row">
            <span className="empty-icon" style={{ width: 48, height: 48, borderRadius: 14 }}>
              <Icon name="lock" />
            </span>
            <div style={{ flex: 1 }}>
              <h3>Your answer is locked in</h3>
              <p className="small muted">Nobody can hear it until everyone has answered. We'll let you know when it unlocks.</p>
            </div>
          </div>
          <button className="btn secondary block" onClick={nudge}>
            <Icon name="share" /> Nudge the others
          </button>
        </div>
      )}

      {round.status === "unlocked" && (
        <div className="stack">
          <span className="eyebrow">Everyone answered · listen in your own time</span>
          <AnswerPlayer round={round} members={members} />
        </div>
      )}

      {round.status === "expired" && (
        <div className="card quiet">
          <div className="row">
            <span className="empty-icon" style={{ width: 48, height: 48, borderRadius: 14 }}>
              <Icon name="lock" />
            </span>
            <div style={{ flex: 1 }}>
              <h3>This round stayed locked</h3>
              <p className="small muted">Not everyone answered in time, so these answers stay sealed.</p>
            </div>
          </div>
          {round.answers.length > 0 &&
            (interest ? (
              <p className="small muted">Thanks. We're exploring this and will let you know if it becomes available.</p>
            ) : (
              <>
                <p className="small">Coming soon: unlock a sealed round for £2. Would you use this?</p>
                <button className="btn secondary block" onClick={wantUnlock}>
                  Yes, I'd pay £2 to unlock
                </button>
              </>
            ))}
        </div>
      )}

      {canRecord && (
        <RecorderDock
          roundId={round.id}
          userId={me}
          onSubmitted={(unlocked) => {
            toast(unlocked ? "Everyone's answered. The round is unlocked!" : "Sent. Your answer is locked in.");
            refresh();
          }}
        />
      )}

      <Confirm
        open={confirmShuffle}
        title="Swap the question?"
        body="Everyone in the group will see the new question. You can only do this before anyone has answered."
        confirmLabel="Show a new question"
        onConfirm={shuffle}
        onClose={() => setConfirmShuffle(false)}
      />
    </div>
  );
}
