import { useEffect, useState } from "react";
import { getMyQuestionVote, setQuestionVote } from "../lib/api";
import { useToast } from "./Toast";

/** "Was this a good question?" thumbs up/down, one vote per person per round. */
export function QuestionVote({ roundId, questionId, userId }: { roundId: string; questionId: number; userId: string }) {
  const toast = useToast();
  const [vote, setVote] = useState<-1 | 1 | null>(null);

  useEffect(() => {
    getMyQuestionVote(roundId, userId)
      .then(setVote)
      .catch(() => {});
  }, [roundId, userId]);

  const choose = async (v: -1 | 1) => {
    const next = vote === v ? null : v;
    const before = vote;
    setVote(next);
    navigator.vibrate?.(8);
    try {
      await setQuestionVote(roundId, userId, questionId, next);
      if (next !== null && before === null) toast("Thanks, that helps us pick better questions.");
    } catch (e) {
      setVote(before);
      toast(`Couldn't save your vote. (${(e as Error).message})`);
    }
  };

  return (
    <div className="question-vote">
      <span className="small muted">Was this a good question?</span>
      <div className="row" style={{ gap: 8 }}>
        <button aria-pressed={vote === 1} onClick={() => choose(1)} aria-label="Good question">
          👍
        </button>
        <button aria-pressed={vote === -1} onClick={() => choose(-1)} aria-label="Not a good question">
          👎
        </button>
      </div>
    </div>
  );
}
