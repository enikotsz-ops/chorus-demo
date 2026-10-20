import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_MS = 10 * 60 * 1000;
export const WARN_MS = 9 * 60 * 1000;
const BARS = 48;

export type RecorderStatus = "idle" | "requesting" | "denied" | "unsupported" | "recording" | "recorded" | "error";

// Safari records MP4/AAC, Chrome and Firefox record WebM/Opus.
function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  const [hitLimit, setHitLimit] = useState(false);

  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const timer = useRef<number>();
  const startedAt = useRef(0);
  const durationRef = useRef(0);

  const cleanup = useCallback(() => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
  }, []);

  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    setInterrupted(false);
    setHitLimit(false);
    setBlob(null);
    setLevels([]);
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as DOMException).name;
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
      return;
    }
    stream.current = media;

    const mime = pickMime();
    const recorder = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      durationRef.current = Math.min(Date.now() - startedAt.current, MAX_MS);
      setElapsed(durationRef.current);
      cleanup();
      if (!chunks.length) {
        setStatus("idle");
        return;
      }
      setBlob(new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" }));
      setStatus("recorded");
    };
    rec.current = recorder;

    // A phone call or the OS taking the mic ends the track: keep what we have.
    media.getAudioTracks().forEach((t) =>
      t.addEventListener("ended", () => {
        if (recorder.state === "recording") {
          setInterrupted(true);
          recorder.stop();
        }
      }),
    );

    // Live waveform from the mic level.
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(media).connect(analyser);
      audioCtx.current = ctx;
      const buf = new Uint8Array(analyser.fftSize);
      timer.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevels((l) => [...l.slice(-(BARS - 1)), Math.min(1, peak / 64)]);
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms >= MAX_MS) {
          setHitLimit(true);
          recorder.stop();
        }
      }, 100);
    } catch {
      timer.current = window.setInterval(() => {
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms >= MAX_MS) {
          setHitLimit(true);
          recorder.stop();
        }
      }, 250);
    }

    startedAt.current = Date.now();
    setElapsed(0);
    recorder.start(1000);
    setStatus("recording");
    navigator.vibrate?.(10);
  }, [cleanup]);

  const discard = useCallback(() => {
    setBlob(null);
    setElapsed(0);
    setLevels([]);
    setInterrupted(false);
    setHitLimit(false);
    setStatus("idle");
  }, []);

  /** Restores a saved draft as if it had just been recorded. */
  const restore = useCallback((saved: Blob, durationMs: number) => {
    durationRef.current = durationMs;
    setElapsed(durationMs);
    setBlob(saved);
    setStatus("recorded");
  }, []);

  useEffect(() => {
    // iOS stops recording when the app is backgrounded; finish cleanly.
    const onHide = () => {
      if (document.visibilityState === "hidden" && rec.current?.state === "recording") {
        setInterrupted(true);
        rec.current.stop();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (rec.current?.state === "recording") rec.current.stop();
      cleanup();
    };
  }, [cleanup]);

  return { status, elapsed, levels, blob, interrupted, hitLimit, durationMs: durationRef.current, start, stop, discard, restore };
}
