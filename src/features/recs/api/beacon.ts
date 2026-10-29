/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   beacon.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client's half of the beacon: the impressions and the clicks of the
 * "For you" strip, batched and sent to the bridge.
 *
 * The queue is small on purpose. An event is a page of a slate and what
 * happened to it (shown, or opened); the same event twice is one event; the
 * queue is flushed every ten seconds, at twenty events, and when the tab goes
 * away — a `keepalive` fetch the browser completes after the document is gone.
 *
 * The token rides the Authorization header and NOWHERE else: not in the URL,
 * not in the body (C49). A failed flush is DROPPED, never retried in a loop:
 * a beacon that comes back on its own is a beacon the user cannot turn off.
 *
 * The server decides what is written: the consent comes from the user's row,
 * the rank from the signed slate, the page from the read rules. The client
 * only says what it saw.
 */

import { API_BASE, getActiveJwt } from "@/shared/api/client";

/** What the beacon reports: a page of a slate was shown, or was opened. */
export type BeaconEvent = "impression" | "click";

/** One event of the queue: the page, and what happened to it. */
interface QueuedEvent {
  slate: string;
  pageId: string;
  event: BeaconEvent;
}

/** The knobs of the queue: the app's own are the defaults, the tests replace them. */
export interface BeaconDeps {
  /** The bridge base URL. Empty = no API configured. */
  base(): string;
  /** The session bearer, or null when there is no session. */
  token(): string | null;
  /** The call itself. */
  send(url: string, init: RequestInit): Promise<unknown>;
  /** The tick that flushes the queue every ten seconds; returns its cancel. */
  schedule(fn: () => void, ms: number): () => void;
  /** The hook the browser gives when the tab is hidden; returns its cancel. */
  onHidden(fn: () => void): () => void;
}

/** The queue: what the strip talks to. */
export interface BeaconQueue {
  /** One event: an impression or a click of a page of a slate. */
  report(slate: string, pageId: string, event: BeaconEvent): void;
  /** Send what is queued, now. */
  flush(): Promise<void>;
  /** How many events are waiting. */
  size(): number;
}

/** The route: a BRIDGE route, never under /api/ai/ (C49). */
const PATH = "/api/events/beacon";

/** The tick of the queue. */
const FLUSH_MS = 10_000;

/** How many events are sent at once. */
const MAX_BATCH = 20;

/** The knobs of the app: the bridge, the session, the browser. */
const realDeps: BeaconDeps = {
  base: () => API_BASE,
  token: getActiveJwt,
  send: (url, init) => fetch(url, init),
  schedule: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  },
  onHidden: (fn) => {
    // No document (a test, a worker): there is no tab to hide.
    if (typeof document === "undefined") return () => undefined;
    const onChange = () => {
      if (document.visibilityState === "hidden") fn();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  },
};

/** The key of an event: the same page of the same slate, once. */
function keyOf(event: QueuedEvent): string {
  return `${event.slate}\u0000${event.pageId}\u0000${event.event}`;
}

/**
 * The queue: a set of events waiting to be sent, and the three moments they
 * leave it (ten seconds, twenty events, a hidden tab).
 */
export function createBeaconQueue(overrides: Partial<BeaconDeps> = {}): BeaconQueue {
  const deps: BeaconDeps = { ...realDeps, ...overrides };
  const entries: QueuedEvent[] = [];
  const seen = new Set<string>();
  let cancelTick: (() => void) | null = null;
  let stopHidden: (() => void) | null = null;

  /** Send what is queued: one request per slate, and never a retry. */
  const flush = async (): Promise<void> => {
    if (cancelTick) {
      cancelTick();
      cancelTick = null;
    }
    const batch = entries.splice(0, entries.length);
    for (const entry of batch) seen.delete(keyOf(entry));
    if (batch.length === 0) return;
    const base = deps.base();
    const token = deps.token();
    // No bridge, no session: the events are dropped, not kept for later.
    if (!base || !token) return;
    const bySlate = new Map<string, { event: BeaconEvent; pageId: string }[]>();
    for (const entry of batch) {
      const list = bySlate.get(entry.slate) ?? [];
      list.push({ event: entry.event, pageId: entry.pageId });
      bySlate.set(entry.slate, list);
    }
    for (const [slate, events] of bySlate) {
      try {
        await deps.send(`${base}${PATH}`, {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slate, events }),
        });
      } catch {
        // A failed flush is dropped: the beacon never loops back on its own.
      }
    }
  };

  /** The tick: one flush in ten seconds, and only one at a time. */
  const arm = (): void => {
    if (cancelTick) return;
    cancelTick = deps.schedule(() => {
      cancelTick = null;
      void flush();
    }, FLUSH_MS);
  };

  /** The hidden-tab hook: it is armed with the first event. */
  const armHidden = (): void => {
    if (stopHidden) return;
    stopHidden = deps.onHidden(() => {
      void flush();
    });
  };

  return {
    report(slate: string, pageId: string, event: BeaconEvent): void {
      if (!slate || !pageId) return;
      const entry: QueuedEvent = { slate, pageId, event };
      const key = keyOf(entry);
      // The same event twice is one event: the strip may re-render a card.
      if (seen.has(key)) return;
      seen.add(key);
      entries.push(entry);
      armHidden();
      if (entries.length >= MAX_BATCH) {
        void flush();
        return;
      }
      arm();
    },
    flush,
    size: () => entries.length,
  };
}

/** The queue of the app: it is built with the first event, not at import. */
let theQueue: BeaconQueue | null = null;

function queue(): BeaconQueue {
  if (!theQueue) theQueue = createBeaconQueue();
  return theQueue;
}

/** A page of the slate was shown to the user. */
export function reportImpression(slate: string, pageId: string): void {
  queue().report(slate, pageId, "impression");
}

/** A page of the slate was opened by the user. */
export function reportClick(slate: string, pageId: string): void {
  queue().report(slate, pageId, "click");
}
