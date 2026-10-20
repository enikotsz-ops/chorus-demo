const tints = ["var(--tint-1)", "var(--tint-2)", "var(--tint-3)", "var(--tint-4)"];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function Avatar({ id, name, size = 40 }: { id: string; name?: string | null; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ background: tints[hash(id) % tints.length], width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {(name?.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
