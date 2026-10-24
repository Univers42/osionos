/* ************************************************************************** */
/*                                                                            */
/*   databaseAutofill.ts                                                      */
/*                                                                            */
/*   The host's read side of an AI-filled select (M6). The kit asks for one   */
/*   (database, property) at a time; a table of 200 rows therefore asks ONCE. */
/*                                                                            */
/*   - workspace off → `{}`, from the 30 s opt-in cache;                      */
/*   - one request per (user, database, property) per 15 s, in-flight de-dupe;*/
/*   - any error → `{}`: a broken AI service never breaks the database view.  */
/*                                                                            */
/* ************************************************************************** */

import { getRowSentiments } from "@/features/ai/api/sentiment";
import type { SentimentLabel } from "@/features/ai/model/sentimentPulse";
import { sentimentEnabledCached } from "@/features/settings/ai/sentimentOptInCache";
import { useUserStore } from "@/features/auth";
import { databaseWorkspace } from "./objectDatabaseWorkspaces";

export const ROW_SENTIMENT_TTL_MS = 15_000;

type Rows = Record<string, SentimentLabel>;

const cache = new Map<string, { at: number; rows: Promise<Rows> }>();
let accountKey: string | null = null;

function currentUserId(): string {
  return useUserStore.getState().activeUserId || "anonymous";
}

/** An account switch drops every cached label before the next read. */
function ensureAccount(): void {
  const user = currentUserId();
  if (user === accountKey) return;
  cache.clear();
  accountKey = user;
}

/** Tests call this; nothing in the app needs it beyond an account switch. */
export function resetRowSentimentCache(): void {
  cache.clear();
  accountKey = null;
}

/** The adapter's `read`: labels keyed by record id, or `{}` on any failure. */
export async function readAutofillLabels(databaseId: string, propertyId: string): Promise<Rows> {
  ensureAccount();
  const workspaceId = databaseWorkspace(databaseId) ?? useUserStore.getState().activeWorkspace()?._id;
  if (!workspaceId) return {};
  try {
    if (!(await sentimentEnabledCached(workspaceId))) return {};
    const key = `${accountKey}:${databaseId}:${propertyId}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ROW_SENTIMENT_TTL_MS) return hit.rows;

    const rows = getRowSentiments(databaseId, propertyId);
    cache.set(key, { at: Date.now(), rows });
    try {
      return await rows;
    } catch (thrown) {
      if (cache.get(key)?.rows === rows) cache.delete(key);
      throw thrown;
    }
  } catch {
    return {};
  }
}
