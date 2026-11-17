import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMembersForGroups, getRoundsForGroups, myGroups } from "./api";
import { useAuth } from "./auth";
import type { Group, Member, Round } from "./types";

export type Circle = Group & { role: string };

type CirclesState = {
  loading: boolean;
  error: string | null;
  circles: Circle[];
  rounds: Round[];
  members: (Member & { group_id: string })[];
  /** Open rounds waiting on me, soonest deadline first */
  waiting: Round[];
  refresh: () => Promise<void>;
};

const Ctx = createContext<CirclesState | null>(null);

/** All my circles with their rounds and members, shared by the tab bar and the main tabs. */
export function CirclesProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [state, setState] = useState<Omit<CirclesState, "refresh" | "waiting">>({
    loading: true,
    error: null,
    circles: [],
    rounds: [],
    members: [],
  });
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId || busy.current) return;
    busy.current = true;
    try {
      const circles = await myGroups(userId);
      const ids = circles.map((c) => c.id);
      const [rounds, members] = await Promise.all([getRoundsForGroups(ids), getMembersForGroups(ids)]);
      setState({ loading: false, error: null, circles, rounds, members });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    } finally {
      busy.current = false;
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => document.visibilityState === "visible" && refresh(), 30000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const waiting = useMemo(
    () =>
      state.rounds
        .filter(
          (r) =>
            r.status === "open" && r.participants.includes(userId ?? "") && !r.answers.some((a) => a.user_id === userId),
        )
        .sort((a, b) => a.deadline.localeCompare(b.deadline)),
    [state.rounds, userId],
  );

  return <Ctx.Provider value={{ ...state, waiting, refresh }}>{children}</Ctx.Provider>;
}

const signedOut: CirclesState = {
  loading: false,
  error: null,
  circles: [],
  rounds: [],
  members: [],
  waiting: [],
  refresh: async () => {},
};

/** Shared circle data; empty (with a no-op refresh) on signed-out screens like an invite link. */
export function useCircles() {
  return useContext(Ctx) ?? signedOut;
}

export const LAST_CIRCLE = "chorus:last-circle";

export function rememberCircle(id: string) {
  try {
    localStorage.setItem(LAST_CIRCLE, id);
  } catch {
    /* storage blocked */
  }
}

export function lastCircle(): string | null {
  try {
    return localStorage.getItem(LAST_CIRCLE);
  } catch {
    return null;
  }
}
