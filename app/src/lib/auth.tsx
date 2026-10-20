import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getProfile, saveProfile } from "./api";
import { supabase } from "./supabase";
import { browserTimezone } from "./time";
import type { Profile } from "./types";

type AuthState = {
  loading: boolean;
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthState>({
  loading: true,
  session: null,
  userId: null,
  profile: null,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const userId = session?.user.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const p = await getProfile(userId).catch(() => null);
    // Keep reminders on the person's own clock.
    const tz = browserTimezone();
    if (p && p.timezone !== tz) {
      await saveProfile(userId, { timezone: tz }).catch(() => {});
      p.timezone = tz;
    }
    setProfile(p);
  }, [userId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (userId) refreshProfile().finally(() => setLoading(false));
  }, [userId, refreshProfile]);

  return <Ctx.Provider value={{ loading, session, userId, profile, refreshProfile }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** Signed-in user id; only use inside routes that require auth. */
export const useUserId = () => useContext(Ctx).userId!;
