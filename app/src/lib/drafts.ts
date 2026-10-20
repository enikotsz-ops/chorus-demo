// Keeps an unsent recording on the device so a failed upload or a closed tab
// doesn't lose someone's answer.
type Draft = { blob: Blob; durationMs: number; savedAt: number };

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("chorus", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("drafts");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const req = fn(d.transaction("drafts", mode).objectStore("drafts"));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined; // private mode or storage blocked: drafts are best effort
  }
}

export const saveDraft = (roundId: string, draft: Draft) => run("readwrite", (s) => s.put(draft, roundId));
export const loadDraft = (roundId: string) => run<Draft>("readonly", (s) => s.get(roundId));
export const clearDraft = (roundId: string) => run("readwrite", (s) => s.delete(roundId));
