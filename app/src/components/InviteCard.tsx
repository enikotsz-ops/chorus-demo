import { useAuth } from "../lib/auth";
import { appInviteUrl, shareInvite } from "../lib/invite";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

/** Invite anyone to sign up for Chorus, without adding them to a circle. */
export function InviteCard() {
  const { userId, profile } = useAuth();
  const toast = useToast();
  if (!userId) return null;

  const share = async () => {
    try {
      const result = await shareInvite(userId, profile?.display_name);
      if (result === "copied") toast("Invite link copied. Paste it anywhere.");
    } catch {
      toast(`Copy this link: ${appInviteUrl(userId)}`);
    }
  };

  return (
    <div className="card quiet">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <span className="empty-icon" style={{ width: 44, height: 44, borderRadius: 14, flex: "none" }}>
          <Icon name="share" size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>Invite someone to Chorus</h3>
          <p className="small muted">
            They can sign up and start their own circle. To add people to one of your circles, use that circle's invite
            link instead.
          </p>
        </div>
      </div>
      <div className="panel small" style={{ wordBreak: "break-all" }}>
        {window.location.host}
      </div>
      <button className="btn primary block" onClick={share}>
        <Icon name="share" /> Share invite link
      </button>
    </div>
  );
}
