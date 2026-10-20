import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FeedbackSheet } from "../components/FeedbackSheet";
import { Icon } from "../components/Icon";
import { NotificationsCard } from "../components/NotificationsCard";
import { useToast } from "../components/Toast";
import { saveProfile } from "../lib/api";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

export function Settings() {
  const { userId, profile, session, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [feedback, setFeedback] = useState(false);

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
        <button className="btn secondary block" style={{ background: "var(--paper)" }} disabled={!name.trim() || name === profile?.display_name} onClick={saveName}>
          Save name
        </button>
        <p className="small muted">Signed in as {session?.user.email}</p>
      </div>

      <NotificationsCard />

      <button className="list-item" onClick={() => setFeedback(true)}>
        <Icon name="chat" />
        <span className="grow">Send feedback</span>
        <Icon name="chevron" />
      </button>

      <div className="spacer" />
      <button
        className="btn danger block"
        onClick={async () => {
          await supabase.auth.signOut();
          navigate("/", { replace: true });
        }}
      >
        Sign out
      </button>
      <FeedbackSheet open={feedback} onClose={() => setFeedback(false)} />
    </div>
  );
}
