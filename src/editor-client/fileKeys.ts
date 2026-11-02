// What a tab's opaque key means, kept on the node's own origin so the app can hold a tab for a file
// without ever holding its path (F1). Browsers partition this storage by the app's site, which is
// the scope a tab has anyway.
// Caveat: a browser that blocks storage in a frame loses the keys on reload, and the tab says the
// file must be opened again from the Explorer. The newest 200 are kept.
const STORE = "osionos.disk-files";
const MAX_KEYS = 200;

export type DiskFile = { root: string; rel: string };

function read(): Record<string, DiskFile> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, DiskFile>;
  } catch {
    return {};
  }
}

const newKey = (): string => [...crypto.getRandomValues(new Uint8Array(12))].map((byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 24);

/** The key for a file: the same file keeps its key, so a second click reaches the same tab. */
export function keyForFile(file: DiskFile): string {
  const keys = read();
  const known = Object.entries(keys).find(([, value]) => value.root === file.root && value.rel === file.rel)?.[0];
  if (known) return known;
  const key = newKey();
  const kept = Object.entries(keys).slice(-(MAX_KEYS - 1));
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...Object.fromEntries(kept), [key]: file }));
  } catch { /* storage blocked: the tab still opens now */ }
  memory.set(key, file);
  return key;
}

const memory = new Map<string, DiskFile>();

export const fileForKey = (key: string): DiskFile | null => read()[key] ?? memory.get(key) ?? null;
