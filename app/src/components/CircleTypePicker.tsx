import type { CircleType } from "../lib/types";

const TYPES: { id: CircleType; emoji: string; name: string; text: string }[] = [
  {
    id: "family",
    emoji: "🏡",
    name: "Family",
    text: "Parents, grandparents, siblings, cousins. Questions about family history, childhood and the stories worth keeping.",
  },
  {
    id: "friends",
    emoji: "🥂",
    name: "Friends",
    text: "Old friends, uni mates, the group chat. Questions about shared memories, firsts, dreams and what's happening now.",
  },
];

export function CircleTypePicker({ value, onChange }: { value: CircleType; onChange: (t: CircleType) => void }) {
  return (
    <div className="stack" role="radiogroup" aria-label="Who is this circle for?">
      {TYPES.map((t) => (
        <button key={t.id} type="button" className="type-card" aria-pressed={value === t.id} onClick={() => onChange(t.id)}>
          <span className="game-icon" aria-hidden="true">
            {t.emoji}
          </span>
          <span style={{ flex: 1 }}>
            <h3>{t.name}</h3>
            <span className="small muted">{t.text}</span>
          </span>
          <span className="radio" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
