// What the server's copy of a page body was when a fetch last answered, this session.
// ADR 0064 PS19 (F12): an empty local body counts as empty only once the server's copy
// is empty too. A local [] can outlive a filled server copy: the fetch merge keeps a
// local copy the outbox has not published, so "the server answered" alone is not enough.
//
// Caveat: the answer is remembered for the session. A body another device fills
// afterwards still reads as empty here until a fetch sees it; the starter writes only
// on a click, through the editor's normal versioned save.

import type { Block } from "@/entities/block/model/types";

export type ServerBody = "empty" | "filled";

const answers = new Map<string, ServerBody>();
const listeners = new Set<() => void>();

/** A body that is not an array is unknown, so it counts as filled: never written over. */
export function markServerCopy(pageId: string, content: Block[] | null | undefined): void {
  const body: ServerBody = Array.isArray(content) && content.length === 0 ? "empty" : "filled";
  if (answers.get(pageId) === body) return;
  answers.set(pageId, body);
  for (const listener of listeners) listener();
}

/** null until a fetch has answered for the page. */
export function serverBodyOf(pageId: string): ServerBody | null {
  return answers.get(pageId) ?? null;
}

export function subscribeServerCopies(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
