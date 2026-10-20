import { useState } from "react";
import type { Member, Round } from "../lib/types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

/** Compact "M D L · 3 answered · waiting on you" row that expands to the full list. */
export function MemberStatus({
  round,
  members,
  me,
  expandable = true,
}: {
  round: Round;
  members: Member[];
  me: string;
  expandable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const people = round.participants.map((id) => ({
    id,
    name: members.find((m) => m.user_id === id)?.profile?.display_name ?? "Former member",
    answered: round.answers.some((a) => a.user_id === id),
  }));
  const answered = people.filter((p) => p.answered).length;
  const meAnswered = people.find((p) => p.id === me)?.answered;
  const waitingOn = people.filter((p) => !p.answered);

  let summary: string;
  if (round.status === "unlocked") summary = `${answered} voices · unlocked`;
  else if (round.status === "expired") summary = `${answered} of ${people.length} answered · stayed locked`;
  else if (people.length < 2) summary = "Waiting for someone to join";
  else if (answered === 0) summary = "Nobody has answered yet";
  else if (!meAnswered && round.participants.includes(me)) summary = `${answered} answered · waiting on you`;
  else if (waitingOn.length === 1) summary = `Waiting on ${waitingOn[0].name}`;
  else summary = `${answered} of ${people.length} answered`;

  const avatars = (
    <>
      <span className="avatar-stack">
        {people.slice(0, 5).map((p) => (
          <Avatar key={p.id} id={p.id} name={p.name} size={36} />
        ))}
      </span>
      <span className="small muted" style={{ flex: 1 }}>
        {summary}
      </span>
    </>
  );

  if (!expandable) return <div className="member-row">{avatars}</div>;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <button className="member-row" onClick={() => setOpen(!open)} aria-expanded={open}>
        {avatars}
        <span style={{ transform: open ? "rotate(90deg)" : undefined, color: "var(--muted-2)" }}>
          <Icon name="chevron" size={18} />
        </span>
      </button>
      {open && (
        <div className="member-list">
          {people.map((p) => (
            <div className="member-item" key={p.id}>
              <Avatar id={p.id} name={p.name} />
              <div className="grow">
                <div className="member-name">
                  {p.name}
                  {p.id === me ? " (you)" : ""}
                </div>
                <div className={`status ${p.answered ? "done" : ""}`}>
                  {p.answered ? (round.status === "unlocked" ? "Answered" : "Answered · locked") : "Not answered yet"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
