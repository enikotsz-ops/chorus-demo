import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { audioUrl } from "./api";

export type Track = { id: string; path: string; title: string; subtitle: string };

type PlayerState = {
  queue: Track[];
  index: number;
  playing: boolean;
  loading: boolean;
  progress: number;
  position: number;
  duration: number;
  error: string | null;
  current: Track | null;
  /** Play `queue` starting at `start`; tapping the current track toggles pause. */
  play: (queue: Track[], start?: number) => void;
  toggle: () => void;
  stop: () => void;
};

const Ctx = createContext<PlayerState | null>(null);

/** One audio player for the whole app, so listening continues across screens. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const urls = useRef<Record<string, string>>({});
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const current = queue[index] ?? null;

  const load = useCallback(async (track: Track) => {
    const el = audio.current;
    if (!el) return;
    setLoading(true);
    setError(null);
    setPosition(0);
    try {
      urls.current[track.path] ??= await audioUrl(track.path);
      el.src = urls.current[track.path];
      await el.play();
    } catch {
      setLoading(false);
      setError("Couldn't play this recording. Check your connection and try again.");
    }
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: "Chorus", album: track.subtitle });
    }
  }, []);

  useEffect(() => {
    if (current) load(current);
    // Only when the track itself changes.
  }, [current?.id, queue]);

  const play = useCallback(
    (next: Track[], start = 0) => {
      if (current && next[start]?.id === current.id) {
        const el = audio.current;
        if (el?.paused) el.play();
        else el?.pause();
        return;
      }
      setQueue(next);
      setIndex(start);
    },
    [current],
  );

  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) el.play();
    else el.pause();
  }, []);

  const stop = useCallback(() => {
    audio.current?.pause();
    setQueue([]);
    setIndex(0);
  }, []);

  return (
    <Ctx.Provider
      value={{
        queue,
        index,
        playing,
        loading,
        position,
        duration,
        progress: duration ? position / duration : 0,
        error,
        current,
        play,
        toggle,
        stop,
      }}
    >
      {children}
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
          setPosition(e.currentTarget.currentTime);
          if (isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
        onEnded={() => {
          setPlaying(false);
          if (index + 1 < queue.length) setIndex(index + 1);
        }}
      />
    </Ctx.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer needs PlayerProvider");
  return ctx;
}
