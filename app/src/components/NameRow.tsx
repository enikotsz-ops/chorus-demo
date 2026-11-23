import { useState } from "react";
import { saveProfile } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "./Toast";

/** Your name on one line, locked until you tap Edit. */
export function NameRow() {
  const { userId, profile, session, refreshProfile } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await saveProfile(userId!, { display_name: name.trim() });
      await refreshProfile();
      setEditing(false);
      toast("Name updated");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card name-card">
      <div className="name-row">
        {!editing && <span className="name-label">Your name</span>}
        {editing ? (
          <>
            <input
              className="input name-input"
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && save()}
              aria-label="Your name"
            />
            <button className="btn primary small-btn" disabled={!name.trim() || busy} onClick={save}>
              {busy ? "…" : "Save"}
            </button>
            <button
              className="btn ghost small-btn"
              onClick={() => {
                setName(profile?.display_name ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="name-value">{profile?.display_name}</span>
            <button className="btn secondary small-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          </>
        )}
      </div>
      <p className="small muted">Signed in as {session?.user.email}</p>
    </div>
  );
}
