import { NavLink, useNavigate } from "react-router-dom";
import { useCircles } from "../lib/circles";
import { formatHour } from "../lib/time";
import { Icon, type IconName } from "./Icon";
import { MiniPlayer } from "./MiniPlayer";
import { useToast } from "./Toast";

function Tab({ to, icon, label, end }: { to: string; icon: IconName; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `tab ${isActive ? "on" : ""}`}>
      <Icon name={icon} />
      <span>{label}</span>
    </NavLink>
  );
}

/** Bottom navigation: Circles · Moments · Record · Play · You. */
export function TabBar() {
  const { waiting, circles } = useCircles();
  const navigate = useNavigate();
  const toast = useToast();

  // Record goes to the outstanding question with the soonest deadline.
  const record = () => {
    if (waiting.length) {
      navigate(`/r/${waiting[0].id}`);
      return;
    }
    const next = circles
      .map((c) => c.next_release_at)
      .filter(Boolean)
      .sort()[0];
    if (next) {
      const d = new Date(next);
      toast(
        `You're all caught up. The next question arrives ${d.toLocaleDateString(undefined, { weekday: "long" })} at ${formatHour(d.getHours())}.`,
      );
    } else toast("You're all caught up.");
  };

  return (
    <>
      <MiniPlayer />
      <nav className="tabbar" aria-label="Main">
        <Tab to="/" icon="circles" label="Circles" end />
        <Tab to="/moments" icon="moments" label="Moments" />
        <button className="tab tab-record-wrap" onClick={record} aria-label={waiting.length ? `Record: ${waiting.length} waiting` : "Record"}>
          <span className="tab-record">
            <Icon name="mic" size={28} />
            {waiting.length > 0 && <span className="tab-dot">{waiting.length > 1 ? waiting.length : ""}</span>}
          </span>
          <span>Record</span>
        </button>
        <Tab to="/play" icon="game" label="Play" />
        <Tab to="/settings" icon="user" label="You" />
      </nav>
    </>
  );
}
