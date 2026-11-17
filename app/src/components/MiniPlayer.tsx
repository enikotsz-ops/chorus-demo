import { usePlayer } from "../lib/player";
import { formatDuration } from "../lib/time";
import { Icon } from "./Icon";

/** Now-playing bar above the tab bar; keeps playing while you move between screens. */
export function MiniPlayer() {
  const p = usePlayer();
  if (!p.current) return null;
  return (
    <div className="nowplaying" role="region" aria-label="Now playing">
      <button className="np-play" onClick={p.toggle} aria-label={p.playing ? "Pause" : "Play"}>
        {p.loading ? "…" : <Icon name={p.playing ? "pause" : "play"} size={20} />}
      </button>
      <div className="np-text">
        <b>{p.current.title}</b>
        <span>{p.error ?? p.current.subtitle}</span>
        <div className="np-bar">
          <div style={{ width: `${p.progress * 100}%` }} />
        </div>
      </div>
      <span className="np-time">
        {formatDuration(p.position * 1000)}
        {p.duration ? ` / ${formatDuration(p.duration * 1000)}` : ""}
      </span>
      <button className="np-close" onClick={p.stop} aria-label="Stop">
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
