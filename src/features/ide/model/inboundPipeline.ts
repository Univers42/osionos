/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundPipeline.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Inbound fs-event plumbing: the serial queue that keeps one connection's
// events in order, strict UTF-8 decoding, and the
// Web-Locks leadership that keeps exactly one tab applying per connection.
// Pure and store-free so the node canvas runner can unit-test it directly.

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

export function acquireInboundLeadership(
  workspaceId: string,
  locks: LockManagerLike | undefined,
): Leadership {
  let leader = false;
  let released = false;
  let releaseHold: (() => void) | null = null;

  if (!locks) {
    // Ponytail: a browser without Web Locks (or two such tabs open) applies
    // events in every tab — one sandbox write becomes one page per tab.
    return {
      isLeader: () => !released,
      release: () => { released = true; },
    };
  }

  locks.request(`osio-inbound:${workspaceId}`, { mode: "exclusive" }, () => {
    if (released) return Promise.resolve(); // release() won the grant race
    leader = true;
    // Held for the connection's lifetime: release() (or the tab closing)
    // resolves this, which hands the lock to the next waiting tab.
    return new Promise<void>((resolve) => { releaseHold = resolve; });
  }).catch(() => {
    // Ponytail: a refused request (opaque origin, sandboxed frame) leads like a
    // browser without Web Locks — every such tab applies events — rather than
    // leaving every tab a follower that applies nothing.
    leader = !released;
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
