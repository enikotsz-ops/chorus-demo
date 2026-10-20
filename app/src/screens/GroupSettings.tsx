import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Confirm } from "../components/Sheet";
import { useToast } from "../components/Toast";
import { getGroup, getMembers, leaveGroup, removeMember, updateGroupSettings } from "../lib/api";
import { useUserId } from "../lib/auth";
import { TIMEZONES, formatHour } from "../lib/time";
import type { Member } from "../lib/types";
import { usePoll } from "../lib/usePoll";

export function GroupSettings() {
  const { groupId = "" } = useParams();
  const [params] = useSearchParams();
  const me = useUserId();
  const navigate = useNavigate();
  const toast = useToast();
  const load = useCallback(() => Promise.all([getGroup(groupId), getMembers(groupId)]), [groupId]);
  const { data, refresh } = usePoll(load, 30000);

  const [name, setName] = useState("");
  const [qpw, setQpw] = useState(1);
  const [hour, setHour] = useState(18);
  const [tz, setTz] = useState("Europe/London");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);

  const group = data?.[0];
  const members = data?.[1] ?? [];
  const isAdmin = members.some((m) => m.user_id === me && m.role === "admin");

  useEffect(() => {
    if (!group) return;
    setName(group.name);
    setQpw(group.questions_per_week);
    setHour(group.release_hour);
    setTz(group.timezone);
  }, [group?.id]);

  if (!group) {
    return (
      <div className="screen">
        <div className="skeleton" style={{ height: 300, marginTop: 64 }} />
      </div>
    );
  }

  const inviteUrl = `${window.location.origin}/join/${group.invite_code}`;
  const dirty = name !== group.name || qpw !== group.questions_per_week || hour !== group.release_hour || tz !== group.timezone;

  const share = async () => {
    const text = `Join ${group.name} on Chorus. Each week we answer one question by voice, and hear each other once everyone has answered.`;
    try {
      if (navigator.share) await navigator.share({ title: "Chorus", text, url: inviteUrl });
      else {
        await navigator.clipboard.writeText(inviteUrl);
        toast("Invite link copied");
      }
    } catch {
      /* dismissed */
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateGroupSettings(group.id, name.trim(), qpw, hour, tz);
      await refresh();
      toast("Saved. Changes apply from the next question.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const doRemove = async () => {
    const m = removing!;
    setRemoving(null);
    try {
      await removeMember(group.id, m.user_id);
      refresh();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const doLeave = async () => {
    setLeaving(false);
    try {
      await leaveGroup(group.id);
      navigate("/", { replace: true });
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={() => navigate(`/g/${group.id}`)} aria-label="Back">
          <Icon name="back" />
        </button>
        <span className="topbar-title">Circle</span>
        <span style={{ width: 52 }} />
      </div>

      <div className="card" style={params.get("invite") ? { outline: "3px solid var(--yellow)" } : undefined}>
        <h3>Invite people</h3>
        <p className="small muted">Anyone with this link can join {group.name}. Send it to your family or group chat.</p>
        <div className="panel small" style={{ wordBreak: "break-all" }}>
          {inviteUrl}
        </div>
        <button className="btn primary block" onClick={share}>
          <Icon name="share" /> Share invite link
        </button>
      </div>

      <div className="card">
        <h3>Members · {members.length}</h3>
        <div className="member-list">
          {members.map((m) => (
            <div className="member-item" key={m.user_id}>
              <Avatar id={m.user_id} name={m.profile?.display_name} />
              <div className="grow">
                <div className="member-name">
                  {m.profile?.display_name ?? "New member"}
                  {m.user_id === me ? " (you)" : ""}
                </div>
                <div className="status">{m.role === "admin" ? "Admin" : "Member"}</div>
              </div>
              {isAdmin && m.user_id !== me && (
                <button className="btn danger" onClick={() => setRemoving(m)} style={{ padding: "0 8px" }}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {isAdmin ? (
        <div className="card">
          <h3>Rhythm</h3>
          <div className="field">
            <label htmlFor="gname">Circle name</label>
            <input id="gname" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Questions per week</label>
            <div className="segmented" role="group">
              {[1, 2, 3].map((n) => (
                <button key={n} aria-pressed={qpw === n} onClick={() => setQpw(n)}>
                  {n}
                </button>
              ))}
            </div>
            <p className="small muted">
              {qpw === 1 && "Every Monday. 7 days to answer, then extra time of 1 day, 6 hours and 1 hour."}
              {qpw === 2 && "Monday and Thursday. 3 to 4 days to answer, then extra time of 12 hours, 3 hours and 30 minutes."}
              {qpw === 3 && "Monday, Wednesday and Friday. 2 to 3 days to answer, then extra time of 8 hours, 2 hours and 20 minutes."}
            </p>
          </div>
          <div className="field">
            <label htmlFor="hour">Questions arrive at</label>
            <select id="hour" className="input" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tz">Circle time zone</label>
            <select id="tz" className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
              {(TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES]).map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <p className="small muted">Reminders reach each person in the evening of their own time zone.</p>
          </div>
          <button className="btn primary block" disabled={!dirty || !name.trim() || saving} onClick={save}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      ) : (
        <div className="card quiet">
          <p className="small muted">
            {group.questions_per_week} question{group.questions_per_week > 1 ? "s" : ""} a week, arriving at{" "}
            {formatHour(group.release_hour)} ({group.timezone.replace(/_/g, " ")}). Only the circle admin can change this.
          </p>
        </div>
      )}

      <button className="btn danger block" onClick={() => setLeaving(true)}>
        Leave circle
      </button>

      <Confirm
        open={!!removing}
        title={`Remove ${removing?.profile?.display_name ?? "this member"}?`}
        body="They won't see new questions. If an open round was only waiting on them, it unlocks for everyone else."
        confirmLabel="Remove"
        danger
        onConfirm={doRemove}
        onClose={() => setRemoving(null)}
      />
      <Confirm
        open={leaving}
        title="Leave this circle?"
        body="You'll stop getting questions and lose access to the circle's archive. Someone can invite you back later."
        confirmLabel="Leave circle"
        danger
        onConfirm={doLeave}
        onClose={() => setLeaving(false)}
      />
    </div>
  );
}
