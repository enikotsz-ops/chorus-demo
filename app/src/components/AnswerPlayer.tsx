import { useEffect, useRef, useState } from "react";
import { audioUrl } from "../lib/api";
import { formatDuration } from "../lib/time";
import type { Member, Round } from "../lib/types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

const SPEEDS = [1, 1.5, 2];

/** Plays an unlocked round's answers one at a time, or all in order. */
export function AnswerPlayer({ round, members }: { round: Round; members: Member[] }) {
  const [current, setCurrent] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const playAll = useRef(false);
  const audio = useRef<HTMLAudioElement>(null);
  const urls = useRef<Record<string, string>>({});

  const nameOf = (uid: string) => members.find((m) => m.user_id === uid)?.profile?.display_name ?? "Former member";

  const load = async (index: number) => {
    const a = round.answers[index];
    const el = audio.current;
    if (!a || !el) return;
    setCurrent(index);
    setProgress(0);
    setLoading(true);
    setError(null);
    try {
      urls.current[a.id] ??= await audioUrl(a.storage_path);
      el.src = urls.current[a.id];
      el.playbackRate = speed;
      await el.play();
    } catch {
      setError("Couldn't play this answer. Check your connection and try again.");
      setLoading(false);
    }
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: nameOf(a.user_id), artist: "Chorus", album: round.question.text });
    }
  };

  const toggle = (index: number) => {
    const el = audio.current;
    if (!el) return;
    if (current === index) {
      if (el.paused) el.play();
      else el.pause();
    } else {
      playAll.current = false;
      load(index);
    }
  };

  const startAll = () => {
    playAll.current = true;
    load(0);
  };

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  return (
    <div className="stack">
      <div className="row">
        <button className="btn primary" style={{ flex: 1 }} onClick={startAll}>
          <Icon name="play" size={20} /> Play all
        </button>
        <button
          className="btn secondary"
          onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
          aria-label="Playback speed"
          style={{ minWidth: 72 }}
        >
          {speed}x
        </button>
      </div>

      {round.answers.map((a, i) => (
        <div className={`player-item ${current === i ? "active" : ""}`} key={a.id}>
          <button className="play-btn" onClick={() => toggle(i)} aria-label={current === i && playing ? "Pause" : `Play ${nameOf(a.user_id)}`}>
            {current === i && loading ? "…" : <Icon name={current === i && playing ? "pause" : "play"} size={20} />}
          </button>
          <Avatar id={a.user_id} name={nameOf(a.user_id)} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="member-name">{nameOf(a.user_id)}</span>
              <span className="small muted">{formatDuration(a.duration_ms)}</span>
            </div>
            <div className="progress">
              <div style={{ width: `${current === i ? progress * 100 : 0}%` }} />
            </div>
          </div>
        </div>
      ))}

      {error && <p className="error-text">{error}</p>}

      <audio
        ref={audio}
        preload="none"
        onPlaying={() => {
          setPlaying(true);
          setLoading(false);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration && isFinite(el.duration)) setProgress(el.currentTime / el.duration);
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(1);
          if (playAll.current && current !== null && current + 1 < round.answers.length) load(current + 1);
          else playAll.current = false;
        }}
      />
    </div>
  );
}
