import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FeedbackSheet } from "../components/FeedbackSheet";
import { Icon } from "../components/Icon";
import { NotificationsCard } from "../components/NotificationsCard";
import { Sheet } from "../components/Sheet";
import { useToast } from "../components/Toast";
import { deleteAccount, saveProfile, setLaunchUpdates } from "../lib/api";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [keep, setKeep] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(keep!);
      localStorage.clear();
      window.location.replace("/");
    } catch (e) {
      setError(`Something went wrong, and your account has not been deleted. Please try again. (${(e as Error).message})`);
      setBusy(false);
    }
  };

  const option = (value: boolean, title: string, body: string) => (
    <button
      className="list-item"
      style={{ background: "var(--paper)", outline: keep === value ? "2px solid var(--ink)" : undefined, alignItems: "flex-start" }}
      onClick={() => setKeep(value)}
      aria-pressed={keep === value}
    >
      <span className="grow">
        <span style={{ fontWeight: 600, display: "block" }}>{title}</span>
        <span className="small muted">{body}</span>
      </span>
      {keep === value && <Icon name="check" />}
    </button>
  );

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose}>
      <h3>Delete your account</h3>
      <p className="muted small">
        Your email, name and reminders will be deleted, and you'll leave all your circles. This can't be undone. What should
        happen to the answers you've already shared?
      </p>
      {option(false, "Remove all my recordings", "They're deleted from every circle. Nobody will be able to hear them again.")}
      {option(
        true,
        "Leave my recordings with my circles",
        "Your circles can keep listening to them, shown under your name. You won't be able to delete them later.",
      )}
      {error && <p className="error-text">{error}</p>}
      <button
        className="btn primary block"
        style={{ background: keep === null ? undefined : "var(--red)" }}
        disabled={keep === null || busy}
        onClick={remove}
      >
        {busy ? "Deleting…" : "Delete my account"}
      </button>
      <button className="btn secondary block" onClick={onClose} disabled={busy}>
        Cancel
      </button>
    </Sheet>
  );
}

export function Settings() {
  const { userId, profile, session, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [feedback, setFeedback] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const saveName = async () => {
    try {
      await saveProfile(userId!, { display_name: name.trim() });
      await refreshProfile();
      toast("Name updated");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          <Icon name="back" />
        </button>
        <span className="topbar-title">Settings</span>
        <span style={{ width: 52 }} />
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>
        <button
          className="btn secondary block"
          style={{ background: "var(--paper)" }}
          disabled={!name.trim() || name === profile?.display_name}
          onClick={saveName}
        >
          Save name
        </button>
        <p className="small muted">Signed in as {session?.user.email}</p>
      </div>

      <NotificationsCard />

      <div className="card">
        <label className="toggle-row">
          <span style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, display: "block" }}>Launch updates</span>
            <span className="small muted">Email me when the full Chorus app launches.</span>
          </span>
          <input
            type="checkbox"
            checked={profile?.launch_updates === true}
            onChange={async (e) => {
              try {
                await setLaunchUpdates(userId!, e.target.checked);
                await refreshProfile();
              } catch (err) {
                toast((err as Error).message);
              }
            }}
          />
        </label>
      </div>

      <div className="card quiet">
        <h3>Your recordings</h3>
        <p className="small muted">
          Your answers are kept until you delete them. Only members of your circles can hear them, and only once everyone
          has answered. You can delete any answer from its question screen.
        </p>
      </div>

      <button className="list-item" onClick={() => setFeedback(true)}>
        <Icon name="chat" />
        <span className="grow">Send feedback</span>
        <Icon name="chevron" />
      </button>

      <div className="spacer" />
      <button
        className="btn secondary block"
        onClick={async () => {
          await supabase.auth.signOut();
          navigate("/", { replace: true });
        }}
      >
        Sign out
      </button>
      <button className="btn danger block" onClick={() => setDeleting(true)}>
        Delete account
      </button>
      <FeedbackSheet open={feedback} onClose={() => setFeedback(false)} />
      <DeleteAccountSheet open={deleting} onClose={() => setDeleting(false)} />
    </div>
  );
}
