/* ************************************************************************** */
/*                                                                            */
/*   sentimentOptInCache.ts                                                   */
/*                                                                            */
/*   The workspace sentiment switch, read at most once per 30 s by the        */
/*   database cells. The service stays the authority (C138): this is a UX     */
/*   short-circuit so a table of 200 rows does not ask 200 times.             */
/*                                                                            */
/* ************************************************************************** */

import { getSentimentSettings } from "@/features/ai/api/sentiment";

export const SENTIMENT_OPT_IN_TTL_MS = 30_000;

type Entry = { enabled: boolean; at: number };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<boolean>>();

/** True when the workspace opted in, cached for 30 s; errors are not cached. */
export function sentimentEnabledCached(workspaceId: string): Promise<boolean> {
  const hit = cache.get(workspaceId);
  if (hit && Date.now() - hit.at < SENTIMENT_OPT_IN_TTL_MS) return Promise.resolve(hit.enabled);
  const pending = inFlight.get(workspaceId);
  if (pending) return pending;

  const request = getSentimentSettings(workspaceId)
    .then((enabled) => {
      cache.set(workspaceId, { enabled, at: Date.now() });
      return enabled;
    })
    .finally(() => {
      inFlight.delete(workspaceId);
    });
  inFlight.set(workspaceId, request);
  return request;
}

/** After a successful toggle the next read must see the new state. */
export function invalidateSentimentOptIn(workspaceId: string): void {
  cache.delete(workspaceId);
  inFlight.delete(workspaceId);
}

/** Tests and an account switch start clean. */
export function resetSentimentOptInCache(): void {
  cache.clear();
  inFlight.clear();
}
