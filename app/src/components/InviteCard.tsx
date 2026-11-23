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
      <div className="row">
        <span className="empty-icon" style={{ width: 40, height: 40, borderRadius: 12, flex: "none" }}>
          <Icon name="share" size={20} />
        </span>
        <h3 style={{ flex: 1 }}>Invite someone to Chorus</h3>
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
