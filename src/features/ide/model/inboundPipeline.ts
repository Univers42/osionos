/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundPipeline.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Inbound fs-event plumbing: the serial queue that keeps one connection's
// events in order, strict UTF-8 decoding, and the
// Web-Locks leadership that keeps exactly one tab applying per connection.
// Free of the page store (appRemovals is a plain map) so the node canvas runner
// can unit-test it directly.
import { clearAppRemovals } from "@/store/appRemovals";

export interface SerialQueue {
  run(task: () => Promise<void>): Promise<void>;
  idle(): Promise<void>;
}

/** FIFO, one task at a time; a task that throws or rejects is passed to
 *  `report` and the queue continues. O(1) per run — a promise chain, not a
 *  polling loop. */
export function createSerialQueue(report: (error: unknown) => void): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    run(task) {
      // Chain onto tail: the next event starts only after this one settled.
      const settled = tail.then(task).catch((error) => { report(error); });
      tail = settled.then(() => {}); // keep the chain alive for the next run
      return settled;
    },
    // Until the queue is empty, tasks queued meanwhile included: a drain's flush
    // is queued by the event before it. O(tasks queued while waiting).
    async idle() {
      for (let seen = tail; ; seen = tail) {
        await seen;
        if (seen === tail) return;
      }
    },
  };
}

/** Decode base64 file content as UTF-8, null when the input is not base64 or
 *  not valid UTF-8 — a non-text file must never reach the page store as
 *  replacement characters. O(length). */
export function decodeUtf8Strict(base64: string): string | null {
  let bytes: Uint8Array;
  try {
    const bin = atob(base64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The subset of navigator.locks this module calls (request is all we need). */
export interface LockManagerLike {
  request(
    name: string,
    options: { mode: "exclusive" },
    callback: () => Promise<void>,
  ): Promise<void>;
}

export interface Leadership {
  isLeader(): boolean;
  release(): void;
}

// The tab's current leadership per workspace, for the writer (usePageFileWriter): a file is
// removed only by the tab that applies shell events AND holds its user's app intent for the
// page (store/appRemovals). A tab that does not lead knows the tree only as of its last
// refetch: after the leader's `rm -rf proj && git clone`, its user trashing the old `proj`
// had the server name the old children, and the agreements it loaded matched the re-cloned
// bytes, so it removed the clone (devil ST1 on 709fbea, 2026-10-14). That tab still spends
// the intent and counts the file as left without a page.
// A tab that GAINS the lead is that stale tab until it has looked again: it clears its
// intents, and removes nothing until an attach that started after the gain has refetched the
// pages and finished (attachUnderLead). Without that, a stale tab that took over when the
// leader closed removed the clone on its user's trash of the old folder, and so did an intent
// recorded as a follower when the handover fell inside the writer's 800 ms debounce (devil
// HO-B and HO-C on 7ca3090, 2026-10-14).
// Ponytail: a page trashed in a tab that does not lead, or before its first attach as leader,
// keeps its file in the sandbox; the writer's Output line counts it as left without a page.
type Lead = { leadership: Leadership; gains: number; settled: boolean };
const leads = new Map<string, Lead>();

/** Whether this tab applies the workspace's shell events now. */
export function leadsInbound(workspaceId: string): boolean {
  return leads.get(workspaceId)?.leadership.isLeader() ?? false;
}

/** Whether this tab may remove a file its user removed in the app: it leads, and has attached since it gained the lead. */
export function removesForItsUser(workspaceId: string): boolean {
  const lead = leads.get(workspaceId);
  return lead !== undefined && lead.settled && lead.leadership.isLeader();
}

/**
 * Called as an attach starts. The function it returns, called once that attach has refetched
 * the pages and finished, opens removals (removesForItsUser), unless the lead was released
 * or gained again in between: only an attach that started after the gain counts.
 */
export function attachUnderLead(workspaceId: string): () => void {
  const lead = leads.get(workspaceId);
  const gains = lead?.gains;
  return () => {
    if (lead !== undefined && leads.get(workspaceId) === lead && lead.gains === gains && lead.leadership.isLeader()) lead.settled = true;
  };
}

/** `onGain` runs each time this tab gains the lead, after its intents are cleared (maybe synchronously). */
export function acquireInboundLeadership(
  workspaceId: string,
  locks: LockManagerLike | undefined,
  onGain?: () => void,
): Leadership {
  const lead: Lead = { leadership: { isLeader: () => false, release: () => undefined }, gains: 0, settled: false };
  const held = requestLeadership(workspaceId, locks, () => {
    lead.gains += 1;
    lead.settled = false;
    clearAppRemovals(workspaceId);
    onGain?.();
  });
  lead.leadership = {
    isLeader: held.isLeader,
    release: () => {
      held.release();
      if (leads.get(workspaceId) === lead) leads.delete(workspaceId);
    },
  };
  leads.set(workspaceId, lead);
  return lead.leadership;
}

/**
 * The leadership a sync effect holds, wired so that a tab which gains the lead AFTER its socket's
 * "ready" (the leader closed) runs `attach`: no other "ready" comes, and the tab may remove
 * nothing until it has attached (attachUnderLead). A gain before "ready" attaches nothing — that
 * tab's own "ready" does. Call `readySeen` where the socket's "ready" arrives.
 */
export function leadAndAttachOnGain(
  workspaceId: string,
  locks: LockManagerLike | undefined,
  run: (task: () => Promise<void>) => void,
  attach: () => Promise<void>,
): { leadership: Leadership; readySeen: () => void } {
  let ready = false;
  const leadership = acquireInboundLeadership(workspaceId, locks, () => {
    if (ready) run(attach);
  });
  return { leadership, readySeen: () => { ready = true; } };
}

function requestLeadership(workspaceId: string, locks: LockManagerLike | undefined, gained: () => void): Leadership {
  let leader = false;
  let released = false;
  let releaseHold: (() => void) | null = null;

  if (!locks) {
    // Ponytail: a browser without Web Locks (or two such tabs open) applies
    // events in every tab — one sandbox write becomes one page per tab.
    gained();
    return {
      isLeader: () => !released,
      release: () => { released = true; },
    };
  }

  locks.request(`osio-inbound:${workspaceId}`, { mode: "exclusive" }, () => {
    if (released) return Promise.resolve(); // release() won the grant race
    leader = true;
    gained();
    // Held for the connection's lifetime: release() (or the tab closing)
    // resolves this, which hands the lock to the next waiting tab.
    return new Promise<void>((resolve) => { releaseHold = resolve; });
  }).catch(() => {
    // Ponytail: a refused request (opaque origin, sandboxed frame) leads like a
    // browser without Web Locks — every such tab applies events — rather than
    // leaving every tab a follower that applies nothing.
    leader = !released;
    if (leader) gained();
  });

  return {
    isLeader: () => leader && !released,
    release: () => {
      released = true;
      releaseHold?.();
      releaseHold = null;
    },
  };
}
