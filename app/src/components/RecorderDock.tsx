import { useEffect, useRef, useState } from "react";
import { QuestionChangedError, submitAnswer } from "../lib/api";
import { clearDraft, loadDraft, saveDraft } from "../lib/drafts";
import { formatDuration } from "../lib/time";
import { MAX_MS, WARN_MS, useRecorder } from "../lib/useRecorder";
import { Icon } from "./Icon";

/** Bottom-anchored record → preview → submit flow, within thumb reach. */
export function RecorderDock({
  roundId,
  questionId,
  userId,
  onSubmitted,
  onQuestionChanged,
}: {
  roundId: string;
  userId: string;
  onSubmitted: (unlocked: boolean) => void;
  /** The question was swapped while recording; the take has been discarded. */
  onQuestionChanged: () => void;
  questionId: number;
}) {
  const r = useRecorder();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);

  // Bring back a take that wasn't submitted last time.
  useEffect(() => {
    loadDraft(roundId).then((d) => {
      if (!d) return;
      // A take recorded for a question that has since been swapped is no use.
      if (d.questionId !== undefined && d.questionId !== questionId) clearDraft(roundId);
      else r.restore(d.blob, d.durationMs);
    });
  }, [roundId]);

  useEffect(() => {
    if (!r.blob) {
      setPreviewUrl(null);
      return;
    }
    saveDraft(roundId, { blob: r.blob, durationMs: r.durationMs, savedAt: Date.now(), questionId });
    const url = URL.createObjectURL(r.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [r.blob, r.durationMs, roundId, questionId]);

  const togglePreview = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) el.play();
    else el.pause();
  };

  const discard = () => {
    audio.current?.pause();
    clearDraft(roundId);
    r.discard();
    setError(null);
  };

  const submit = async () => {
    if (!r.blob) return;
    setSubmitting(true);
    setError(null);
    try {
      const unlocked = await submitAnswer(roundId, userId, r.blob, r.durationMs, questionId);
      await clearDraft(roundId);
      navigator.vibrate?.([10, 40, 10]);
      onSubmitted(unlocked);
    } catch (e) {
      if (e instanceof QuestionChangedError) {
        audio.current?.pause();
        await clearDraft(roundId);
        r.discard();
        onQuestionChanged();
        return;
      }
      setError(`Couldn't send your answer. It's saved on this device, so you can try again. (${(e as Error).message})`);
    } finally {
      setSubmitting(false);
    }
  };

  const recording = r.status === "recording";
  const warn = recording && r.elapsed >= WARN_MS;

  let hint: string;
  switch (r.status) {
    case "requesting":
      hint = "Allow microphone access to record.";
      break;
    case "denied":
      hint = "Microphone access is blocked. Turn it on for this site in your browser or phone settings, then try again.";
      break;
    case "unsupported":
      hint = "This browser can't record audio. Try Safari on iPhone or Chrome on Android.";
      break;
    case "error":
      hint = "We couldn't reach your microphone. Check nothing else is using it and try again.";
      break;
    case "recorded":
      hint = r.hitLimit
        ? "You reached the 10 minute limit. Have a listen before you send."
        : r.interrupted
          ? "Recording stopped when the app was interrupted. We kept what you said."
          : "Have a listen. Send it when you're happy.";
      break;
    default:
      hint = "Tap the mic to record your answer, up to 10 minutes. Nobody hears it until everyone has answered.";
  }

  return (
    <div className="dock">
      <div className="dock-inner">
        {r.status === "recorded" && previewUrl ? (
          <div className="recorder">
            <button className="mic" onClick={togglePreview} aria-label={playing ? "Pause preview" : "Play preview"}>
              <Icon name={playing ? "pause" : "play"} size={30} />
            </button>
            <div className="recorder-body">
              <div className="timer">Your answer · {formatDuration(r.elapsed)}</div>
              <p className="small muted">{hint}</p>
            </div>
            <button className="icon-btn" onClick={discard} aria-label="Delete and record again" style={{ background: "var(--paper)" }}>
              <Icon name="redo" size={22} />
            </button>
            <audio
              ref={audio}
              src={previewUrl}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              preload="metadata"
            />
          </div>
        ) : (
          <div className="recorder">
            <button
              className={`mic ${recording ? "recording" : ""}`}
              onClick={recording ? r.stop : r.start}
              disabled={r.status === "requesting"}
              aria-label={recording ? "Stop recording" : "Start recording"}
            >
              <Icon name={recording ? "stop" : "mic"} size={32} />
            </button>
            <div className="recorder-body">
              {recording ? (
                <>
                  <div className="wave" aria-hidden="true">
                    {r.levels.map((l, i) => (
                      <span key={i} style={{ height: `${Math.max(4, l * 36)}px` }} />
                    ))}
                  </div>
                  <div className={`timer ${warn ? "warn" : ""}`}>
                    {formatDuration(r.elapsed)} / {formatDuration(MAX_MS)}
                    {warn ? ` · ${Math.ceil((MAX_MS - r.elapsed) / 1000)}s left` : ""}
                  </div>
                </>
              ) : (
                <p className="small muted">{hint}</p>
              )}
            </div>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <button className="btn primary block" disabled={!r.blob || submitting || recording} onClick={submit}>
          {submitting ? "Sending…" : error ? "Try again" : "Submit and unlock the round"}
        </button>
      </div>
    </div>
  );
}
