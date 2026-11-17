// Chrome on Android fires "beforeinstallprompt" when the app can be installed.
// Keep the event so an "Install Chorus" button can show the browser's prompt.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();

export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const canPromptInstall = () => deferred !== null;

export function onInstallChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows the browser's install prompt. Resolves true if the person accepted. */
export async function promptInstall() {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  listeners.forEach((l) => l());
  return outcome === "accepted";
}
