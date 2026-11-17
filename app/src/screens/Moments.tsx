import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { CircleSwitcher } from "../components/CircleSwitcher";
import { Icon } from "../components/Icon";
import { SuggestSheet } from "../components/SuggestSheet";
import { useUserId } from "../lib/auth";
import { lastCircle, rememberCircle, useCircles } from "../lib/circles";
import { usePlayer, type Track } from "../lib/player";
import { formatDuration } from "../lib/time";
import { questionLabel, type Answer, type Round } from "../lib/types";

const minutes = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m} min`;
};
const monthOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function groupByMonth<T>(items: T[], at: (t: T) => string) {
  const groups: { month: string; items: T[] }[] = [];
  for (const item of items) {
    const m = monthOf(at(item));
    if (groups[groups.length - 1]?.month !== m) groups.push({ month: m, items: [] });
    groups[groups.length - 1].items.push(item);
  }
  return groups;
}

/** Every voice a circle has unlocked, as a timeline, filterable by person. */
export function Moments() {
  const me = useUserId();
  const navigate = useNavigate();
  const player = usePlayer();
  const [params, setParams] = useSearchParams();
  const { loading, circles, rounds: allRounds, members: allMembers } = useCircles();
  const [suggest, setSuggest] = useState(false);

  const circleId = params.get("c") ?? lastCircle() ?? circles[0]?.id;
  const circle = circles.find((c) => c.id === circleId) ?? circles[0];
  const person = params.get("p");

  const rounds = useMemo(() => allRounds.filter((r) => r.group_id === circle?.id), [allRounds, circle?.id]);
  const members = useMemo(() => allMembers.filter((m) => m.group_id === circle?.id), [allMembers, circle?.id]);
  const unlocked = rounds.filter((r) => r.status === "unlocked");
  const nameOf = (a: Answer) =>
    a.user_id === me
      ? "You"
      : (members.find((m) => m.user_id === a.user_id)?.profile?.display_name ?? a.speaker_name ?? "Former member");
  const avatarName = (uid: string | null, fallback?: string | null) =>
    members.find((m) => m.user_id === uid)?.profile?.display_name ?? fallback ?? "?";
  const track = (a: Answer, r: Round): Track => ({
    id: a.id,
    path: a.storage_path,
    title: nameOf(a),
    subtitle: r.question.text,
  });

  if (loading && !circles.length) {
    return (
      <div className="screen with-tabs">
        <div className="skeleton" style={{ height: 300, marginTop: 60 }} />
      </div>
    );
  }
  if (!circle) {
    return (
      <div className="screen with-tabs">
        <h1 style={{ marginTop: 20 }}>Moments</h1>
        <div className="card empty">
          <h3>No circles yet</h3>
          <p className="muted">Once your circle unlocks its first round, every voice is kept here.</p>
          <Link to="/new" className="btn primary">
            Create a circle
          </Link>
        </div>
      </div>
    );
  }

  const pick = (p: string | null) => {
    rememberCircle(circle.id);
    setParams(p ? { c: circle.id, p } : { c: circle.id }, { replace: true });
  };

  // Everyone: one entry per unlocked round. A person: one entry per answer,
  // plus my own locked answers (only ever shown to me).
  const roundEntries = unlocked;
  const personAnswers = person
    ? rounds
        .flatMap((r) => r.answers.filter((a) => a.user_id === person).map((a) => ({ a, r })))
        .filter(({ r }) => r.status === "unlocked" || person === me)
        .sort((x, y) => y.a.created_at.localeCompare(x.a.created_at))
    : [];
  const shared = personAnswers.filter(({ r }) => r.status === "unlocked");
  const lockedCount = personAnswers.length - shared.length;
  const personMember = members.find((m) => m.user_id === person);
  const personName = person === me ? "You" : (personMember?.profile?.display_name ?? "Former member");
  const totalMs = unlocked.reduce((s, r) => s + r.answers.reduce((t, a) => t + a.duration_ms, 0), 0);
  const stories = unlocked.reduce((s, r) => s + r.answers.length, 0);

  return (
    <div className={`screen with-tabs ${player.current ? "playing" : ""}`}>
      <div className="topbar" style={{ justifyContent: "center" }}>
        <CircleSwitcher current={circle} hrefFor={(id) => `/moments?c=${id}`} />
      </div>
      <h1 style={{ marginTop: -6 }}>Moments</h1>

      <div className="filter-row" role="tablist" aria-label="Whose stories">
        <button className={`filter ${!person ? "on" : ""}`} onClick={() => pick(null)} role="tab" aria-selected={!person}>
          <span className="avatar everyone">✦</span>
          Everyone
        </button>
        {members.map((m) => (
          <button
            key={m.user_id}
            className={`filter ${person === m.user_id ? "on" : ""}`}
            onClick={() => pick(m.user_id)}
            role="tab"
            aria-selected={person === m.user_id}
          >
            <Avatar id={m.user_id} name={m.profile?.display_name} size={56} />
            {m.user_id === me ? "You" : (m.profile?.display_name ?? "Member")}
          </button>
        ))}
      </div>

      {!person ? (
        <>
          <div className="card totals">
            <div>
              <b>{stories}</b>
              <span>stories</span>
            </div>
            <div>
              <b>{minutes(totalMs)}</b>
              <span>listening</span>
            </div>
            <div>
              <b>{unlocked.length}</b>
              <span>questions</span>
            </div>
          </div>

          {roundEntries.length === 0 && (
            <div className="card empty">
              <span className="empty-icon">
                <Icon name="moments" size={30} />
              </span>
              <h3>Your first moments are on their way</h3>
              <p className="muted">When everyone answers a question, the round unlocks and its voices are kept here.</p>
            </div>
          )}

          {groupByMonth(roundEntries, (r) => r.opens_at).map((g) => (
            <section key={g.month} className="stack">
              <div className="month">
                <span className="eyebrow">{g.month}</span>
                <hr />
              </div>
              <div className="timeline">
                {g.items.map((r) => {
                  const ms = r.answers.reduce((t, a) => t + a.duration_ms, 0);
                  const reactions = r.answers.reduce((t, a) => t + a.reactions.length, 0);
                  const comments = r.answers.reduce((t, a) => t + a.comments.length, 0);
                  const queue = r.answers.map((a) => track(a, r));
                  const isPlaying = player.current && queue.some((t) => t.id === player.current!.id) && player.playing;
                  return (
                    <div key={r.id} className="entry" onClick={() => navigate(`/r/${r.id}`)} role="link" tabIndex={0}>
                      <div className="entry-meta">
                        <span className="tiny-pill">{questionLabel(r.question)}</span>
                        <span>{dayOf(r.opens_at)}</span>
                      </div>
                      <p className="entry-q">{r.question.text}</p>
                      <div className="entry-foot">
                        <span className="avatar-stack">
                          {r.answers.slice(0, 5).map((a) => (
                            <Avatar key={a.id} id={a.user_id ?? a.id} name={avatarName(a.user_id, a.speaker_name)} size={30} />
                          ))}
                        </span>
                        <span className="grow">
                          {r.answers.length} voices · {minutes(ms)}
                        </span>
                        <button
                          className="mini-play"
                          aria-label={isPlaying ? "Pause" : "Play this round"}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isPlaying) player.toggle();
                            else player.play(queue);
                          }}
                        >
                          <Icon name={isPlaying ? "pause" : "play"} size={18} />
                        </button>
                      </div>
                      {(reactions > 0 || comments > 0) && (
                        <span className="small muted">
                          {reactions > 0 && `${reactions} reaction${reactions > 1 ? "s" : ""}`}
                          {reactions > 0 && comments > 0 && " · "}
                          {comments > 0 && `💬 ${comments}`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      ) : (
        <>
          <div className="card">
            <div className="row" style={{ gap: 14 }}>
              <Avatar id={person} name={avatarName(person)} size={64} />
              <div>
                <h2 style={{ fontSize: 24 }}>{personName}</h2>
                <span className="small muted">
                  {shared.length} {shared.length === 1 ? "story" : "stories"} ·{" "}
                  {minutes(shared.reduce((t, x) => t + x.a.duration_ms, 0))}
                  {shared.length > 0 && ` · since ${monthOf(shared[shared.length - 1].a.created_at)}`}
                  {lockedCount > 0 && ` · ${lockedCount} waiting to unlock`}
                </span>
              </div>
            </div>
            {shared.length > 0 && (
              <button className="btn primary block" onClick={() => player.play(shared.map(({ a, r }) => track(a, r)))}>
                <Icon name="play" /> Play all of {person === me ? "your" : `${personName}'s`} stories
              </button>
            )}
          </div>

          {personAnswers.length === 0 && (
            <p className="small muted" style={{ textAlign: "center" }}>
              No unlocked stories from {personName} yet.
            </p>
          )}

          {groupByMonth(personAnswers, (x) => x.a.created_at).map((g) => (
            <section key={g.month} className="stack">
              <div className="month">
                <span className="eyebrow">{g.month}</span>
                <hr />
              </div>
              <div className="timeline">
                {g.items.map(({ a, r }) => {
                  const locked = r.status !== "unlocked";
                  const isPlaying = player.current?.id === a.id && player.playing;
                  return (
                    <div
                      key={a.id}
                      className={`entry ${locked ? "locked" : ""}`}
                      onClick={() => navigate(`/r/${r.id}`)}
                      role="link"
                      tabIndex={0}
                    >
                      <div className="entry-meta">
                        <span className="tiny-pill">{questionLabel(r.question)}</span>
                        <span>{dayOf(a.created_at)}</span>
                      </div>
                      <p className="entry-q">{r.question.text}</p>
                      <div className="entry-foot">
                        <button
                          className={`mini-play ${locked ? "yellow" : ""}`}
                          aria-label={isPlaying ? "Pause" : "Play"}
                          onClick={(e) => {
                            e.stopPropagation();
                            player.play([track(a, r)]);
                          }}
                        >
                          <Icon name={isPlaying ? "pause" : "play"} size={18} />
                        </button>
                        <span className="grow">
                          {locked ? "Your answer · " : ""}
                          {formatDuration(a.duration_ms)}
                        </span>
                        {!locked && (a.reactions.length > 0 || a.comments.length > 0) && (
                          <span className="small muted">
                            {a.reactions.length > 0 && `${a.reactions.map((x) => x.emoji).slice(0, 3).join("")} ${a.reactions.length}`}
                            {a.comments.length > 0 && ` · 💬 ${a.comments.length}`}
                          </span>
                        )}
                      </div>
                      {locked && (
                        <span className="only-you">
                          <Icon name="lock" size={14} />{" "}
                          {r.status === "expired"
                            ? "This round stayed locked. Only you can hear this."
                            : "Only you can hear this until everyone answers"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      <button className="list-item" onClick={() => setSuggest(true)}>
        <span className="empty-icon" style={{ width: 40, height: 40, borderRadius: 12, flex: "none" }}>
          <Icon name="question" size={20} />
        </span>
        <span className="grow">
          <b>Suggest a question</b>
          <span className="small muted" style={{ display: "block" }}>
            Ask {circle.name} something, with your name on it.
          </span>
        </span>
        <Icon name="chevron" />
      </button>

      <SuggestSheet open={suggest} onClose={() => setSuggest(false)} groupId={circle.id} isAdmin={circle.role === "admin"} />
    </div>
  );
}
