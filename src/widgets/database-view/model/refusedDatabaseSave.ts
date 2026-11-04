/**
 * Tells the user when the server refuses a database save. A refusal used to be swallowed
 * ("keep dirty, retried next flush"), so a database the grobase WAF refused (#281: one
 * sentence in a row, 403 from nginx) failed on every later save while the user saw nothing
 * and the edits lived only in that browser. The save is still retried; this only speaks.
 *
 * Kept free of the api client so the canvas runner can load it.
 */

import { useToastStore } from "@osionos/ui/primitives/useToastStore";

/** A refusal that the same request will meet again. 401 (session refresh), 408, 409 (handled
 *  by the caller), 429 and every 5xx or network failure clear up on their own. */
const LASTING_REFUSALS = new Set([400, 403, 413, 415, 422]);

const warned = new Map<string, string>();

function reasonFor(status: number): string {
  if (status === 413) return "It is larger than the server accepts.";
  if (status === 403) return "The server's request filter refused its content.";
  return `The server refused it (${status}).`;
}

/**
 * Toasts once per database and content version; a later edit that is refused again warns
 * again. Returns whether it toasted.
 */
export function noticeRefusedDatabaseSave(dbKey: string, title: string, contentHash: string, status: number | undefined): boolean {
  if (status === undefined || !LASTING_REFUSALS.has(status)) return false;
  if (warned.get(dbKey) === contentHash) return false;
  warned.set(dbKey, contentHash);
  useToastStore.getState().push({
    kind: "error",
    title: `“${title || "Untitled database"}” was not saved`,
    description: `${reasonFor(status)} Your edits are kept in this browser only; saving is retried after each change.`,
  });
  return true;
}

/** A save that went through clears the warning, so the next refusal is reported. */
export function clearRefusedDatabaseSave(dbKey: string): void {
  warned.delete(dbKey);
}
