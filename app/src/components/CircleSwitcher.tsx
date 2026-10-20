import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { myGroups } from "../lib/api";
import { useUserId } from "../lib/auth";
import type { Group } from "../lib/types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export const LAST_CIRCLE = "chorus:last-circle";

/** Tappable circle name in the top bar that opens a list of all my circles. */
export function CircleSwitcher({ current }: { current: Group }) {
  const userId = useUserId();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [circles, setCircles] = useState<(Group & { role: string })[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(false);
    myGroups(userId)
      .then(setCircles)
      .catch(() => setError(true));
  }, [open, userId]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <button className="topbar-title switcher" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="switcher-name">{current.name}</span>
        <span className="switcher-caret" aria-hidden="true">
          <Icon name="chevron" size={16} />
        </span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)}>
        <h3>Your circles</h3>
        {error && <p className="error-text">Couldn't load your circles. Check your connection.</p>}
        {!circles && !error && <div className="skeleton" style={{ height: 64 }} />}
        <div className="stack" style={{ gap: 8 }}>
          {circles?.map((c) => (
            <button
              key={c.id}
              className="list-item"
              style={{ background: c.id === current.id ? "var(--sand)" : "var(--paper)" }}
              onClick={() => go(`/g/${c.id}`)}
              aria-current={c.id === current.id}
            >
              <Avatar id={c.id} name={c.name} />
              <span className="grow">
                <span style={{ fontWeight: 600, display: "block" }}>{c.name}</span>
                <span className="small muted">{c.role === "admin" ? "You run this circle" : "Member"}</span>
              </span>
              {c.id === current.id && <Icon name="check" />}
            </button>
          ))}
        </div>
        <button className="btn primary block" onClick={() => go("/new")}>
          <Icon name="plus" /> Create a new circle
        </button>
        <p className="small muted" style={{ textAlign: "center" }}>
          To join someone else's circle, open the invite link they sent you.
        </p>
      </Sheet>
    </>
  );
}
