export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";

export function timeLeft(deadline: string, now = Date.now()): string {
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return "Closing now";
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins} min left`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} left`;
}

export function isUrgent(deadline: string, now = Date.now()) {
  return new Date(deadline).getTime() - now < 24 * 3600 * 1000;
}

export function formatDuration(ms: number) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatHour(hour: number) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const TIMEZONES: string[] = (() => {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  return intl.supportedValuesOf?.("timeZone") ?? ["Europe/London", browserTimezone()];
})();

export function timeAgo(iso: string, now = Date.now()) {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(iso);
}
