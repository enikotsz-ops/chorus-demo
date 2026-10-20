import { supabase } from "./supabase";

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iOS only allows web push from an app added to the Home Screen. */
export const needsInstallForPush = () => isIOS() && !isStandalone();

export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(VAPID);

export type PushState = "unsupported" | "needs-install" | "default" | "granted" | "denied";

export function pushState(): PushState {
  if (needsInstallForPush()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  return Notification.permission as PushState;
}

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks for permission (must run from a tap) and stores the subscription. */
export async function enablePush(userId: string): Promise<PushState> {
  if (!pushSupported()) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission as PushState;

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID!) }));
  const json = sub.toJSON();
  const res = await supabase.from("push_subscriptions").upsert({
    endpoint: sub.endpoint,
    user_id: userId,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  });
  if (res.error) throw new Error(res.error.message);
  return "granted";
}
