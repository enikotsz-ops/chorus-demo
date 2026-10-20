import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import { AuthProvider, useAuth } from "./lib/auth";
import { configured } from "./lib/supabase";
import { Archive } from "./screens/Archive";
import { GroupHome } from "./screens/GroupHome";
import { GroupSettings } from "./screens/GroupSettings";
import { Home } from "./screens/Home";
import { Join, PENDING_INVITE } from "./screens/Join";
import { NewGroup } from "./screens/NewGroup";
import { Onboarding } from "./screens/Onboarding";
import { RoundScreen } from "./screens/RoundScreen";
import { Settings } from "./screens/Settings";
import { SignIn } from "./screens/SignIn";

const ONBOARDED = "chorus:onboarded";

function Routed() {
  const { loading, userId, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDED) === "1");

  // After signing in from an invite link, finish joining.
  useEffect(() => {
    const code = localStorage.getItem(PENDING_INVITE);
    if (userId && profile?.display_name && onboarded && code && !pathname.startsWith("/join/")) {
      navigate(`/join/${code}`, { replace: true });
    }
  }, [userId, profile?.display_name, onboarded, pathname, navigate]);

  if (loading) {
    return (
      <div className="screen" style={{ justifyContent: "center", alignItems: "center" }}>
        <img src="/icons/icon.svg" width={72} height={72} alt="" />
      </div>
    );
  }

  if (!userId) {
    return (
      <Routes>
        <Route path="/join/:code" element={<Join />} />
        <Route path="*" element={<SignIn />} />
      </Routes>
    );
  }

  if (!profile?.display_name || !onboarded) {
    return (
      <Onboarding
        onDone={() => {
          localStorage.setItem(ONBOARDED, "1");
          setOnboarded(true);
        }}
      />
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/new" element={<NewGroup />} />
      <Route path="/join/:code" element={<Join />} />
      <Route path="/g/:groupId" element={<GroupHome />} />
      <Route path="/g/:groupId/archive" element={<Archive />} />
      <Route path="/g/:groupId/settings" element={<GroupSettings />} />
      <Route path="/r/:roundId" element={<RoundScreen />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  if (!configured) {
    return (
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="card">
          <h2>Almost there</h2>
          <p className="muted">
            Chorus isn't connected to its database yet. Copy <code>.env.example</code> to <code>.env</code> and add your
            Supabase URL and anon key.
          </p>
        </div>
      </div>
    );
  }
  return (
    <AuthProvider>
      <ToastProvider>
        <Routed />
      </ToastProvider>
    </AuthProvider>
  );
}
