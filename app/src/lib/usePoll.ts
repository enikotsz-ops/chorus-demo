import { useCallback, useEffect, useState } from "react";

/** Loads data, then refreshes it every `ms` while the app is visible and on refocus. */
export function usePoll<T>(load: () => Promise<T>, ms = 20000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [load]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => document.visibilityState === "visible" && refresh(), ms);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, ms]);

  return { data, error, refresh };
}
