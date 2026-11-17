import { useEffect, useState } from "react";
import { useToast } from "../components/Toast";
import { getGameInterest, setGameInterest } from "../lib/api";
import { useUserId } from "../lib/auth";

const GAMES = [
  { id: "two-truths", emoji: "🎭", name: "Two truths and a tale", text: "Record three short stories. One is made up. Everyone guesses which." },
  { id: "who-said-it", emoji: "🎧", name: "Who said it?", text: "Hear the first five seconds of an answer and guess who it is." },
  { id: "pass-the-story", emoji: "🧵", name: "Pass the story", text: "One story, everyone adds 30 seconds. See where it ends up." },
  { id: "circle-streak", emoji: "🔥", name: "Circle streak", text: "Keep the whole circle answering to grow your shared streak." },
];

/** Games are still to be decided: show the ideas and record which ones people would play. */
export function Play() {
  const me = useUserId();
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    getGameInterest(me)
      .then(setPicked)
      .catch(() => {});
  }, [me]);

  const toggle = async (id: string) => {
    const on = !picked.includes(id);
    setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
    try {
      await setGameInterest(me, id, on);
      if (on) toast("Thanks! We'll build the favourite first.");
    } catch (e) {
      setPicked((p) => (on ? p.filter((x) => x !== id) : [...p, id]));
      toast((e as Error).message);
    }
  };

  return (
    <div className="screen with-tabs">
      <h1 style={{ marginTop: 20 }}>Play</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Quick games for your circle are coming. Tap the ones you'd play and we'll build the favourite first.
      </p>
      {GAMES.map((g) => {
        const on = picked.includes(g.id);
        return (
          <div key={g.id} className="game">
            <span className="game-icon" aria-hidden="true">
              {g.emoji}
            </span>
            <div style={{ flex: 1 }}>
              <h3>{g.name}</h3>
              <p className="small muted">{g.text}</p>
              <button className={`vote ${on ? "on" : ""}`} onClick={() => toggle(g.id)} aria-pressed={on}>
                {on ? "✓ You'd play this" : "👍 I'd play this"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
