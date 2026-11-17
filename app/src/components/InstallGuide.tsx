import { useEffect, useState } from "react";
import { canPromptInstall, onInstallChange, promptInstall } from "../lib/install";
import { isAndroid, isIOS, isStandalone } from "../lib/push";
import { Icon } from "./Icon";

/** "Add to Home Screen" steps for the person's own phone. Hidden once Chorus is installed. */
export function InstallGuide() {
  const [canInstall, setCanInstall] = useState(canPromptInstall());
  useEffect(() => {
    const off = onInstallChange(() => setCanInstall(canPromptInstall()));
    return () => {
      off();
    };
  }, []);

  if (isStandalone()) return null;

  const address = window.location.host;
  const ios = isIOS();
  const android = isAndroid();

  return (
    <div className="panel stack install-guide">
      <h3>Get Chorus on your Home Screen</h3>
      <p className="small muted">
        {ios
          ? "On iPhone this is the only way to get reminders, and you'll stay signed in."
          : "It opens like an app, and you'll stay signed in."}
      </p>

      {android && canInstall && (
        <button className="btn yellow block" onClick={() => promptInstall()}>
          <Icon name="plus" /> Install Chorus
        </button>
      )}

      {(ios || !android) && (
        <div className="stack" style={{ gap: 6 }}>
          {!ios && <b className="small">iPhone (Safari)</b>}
          <ol className="steps-list">
            <li>
              Open <b>{address}</b> in <b>Safari</b>
            </li>
            <li>
              Tap <b>Share</b> <Icon name="share" size={16} /> (if you don't see it, tap <b>•••</b> first)
            </li>
            <li>
              Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>
            </li>
            <li>Open Chorus from your Home Screen and sign in with the code from your email</li>
            <li>
              Go to <b>Settings</b> and tap <b>Turn on reminders</b>, then <b>Allow</b>
            </li>
          </ol>
        </div>
      )}

      {(android || !ios) && !(android && canInstall) && (
        <div className="stack" style={{ gap: 6 }}>
          {!android && <b className="small">Android (Chrome)</b>}
          <ol className="steps-list">
            <li>
              Open <b>{address}</b> in <b>Chrome</b>
            </li>
            <li>
              Tap the <b>⋮</b> menu (top right)
            </li>
            <li>
              Tap <b>Add to Home screen</b> or <b>Install app</b>, then confirm
            </li>
            <li>
              Open Chorus from your Home Screen and turn on reminders in <b>Settings</b>
            </li>
          </ol>
        </div>
      )}

      <p className="small muted">
        Tip: always open Chorus from the Home Screen icon, not from your browser or a link in an email.
      </p>
    </div>
  );
}
