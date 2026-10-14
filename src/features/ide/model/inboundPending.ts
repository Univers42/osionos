/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundPending.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What the inbound executor holds between events: the archives a shell delete
// queued, the deleted directories that count as move evidence, and the pages
// this flow archived (so their file coming back restores instead of copying).
// Store-free, timers injected: one instance per sync effect and leadership.

import type { DirRole } from "./inboundPlan";

/**
 * How long a shell delete waits before it archives: `mv`/vim/git arrive as a
 * delete followed by writes, and the writes must land inside this window to
 * read as a rename. Ponytail: the window lives in THIS tab's memory. A reload,
 * a crash or a closed tab inside it drops the timer, so the page stays live
 * while its file is gone — the safe direction: the next attach rewrites the file
 * and the shell `rm` is undone. Two tabs: only the leader schedules; when the
 * leader goes away its timers go with it and the new leader never archives
 * that page (same outcome). A write slower than the window after its delete
 * (a stalled `mv` across a slow disk) archives first and then restores through
 * archivedByInbound, or copies if this tab no longer remembers the archive.
 */
export const INBOUND_WINDOW_MS = 1_500;

/**
 * The restore memory spans the whole tab session (switching git branches hours
 * apart is normal), bounded by least-recently-used eviction. Ponytail: a page
 * evicted past the cap, or archived by another tab or before a reload, comes
 * back from the shell as a COPY (a new page) instead of a restore — a duplicate,
 * never a loss; the archived original stays in the trash.
 */
export const ARCHIVED_BY_INBOUND_CAP = 1_000;

export type Schedule = (run: () => void, ms: number) => () => void;

/** A due archive: the executor claims it, then re-checks before archiving. */
export interface ArchiveTicket {
  readonly pageId: string;
  readonly path: string;
  readonly seq: number;
}

export interface DeletedDir {
  readonly path: string;
  readonly role: DirRole;
  readonly ownerId: string;
}

export interface ArchivedByInbound {
  readonly syncedHash: string | null;
  readonly path: string;
}

export interface InboundPending {
  hasOwn(pageId: string): boolean;
  /** `onDue` runs through `enqueue` when the window ends, never from the timer itself. */
  schedule(pageId: string, path: string, onDue: (ticket: ArchiveTicket) => Promise<void>): void;
  cancel(pageId: string): void;
  /** True once, for the ticket still current: the archive leaves the pending set. */
  claim(ticket: ArchiveTicket): boolean;
  /** Paths whose window ended and whose archive has not run yet (inboundStatBatch). */
  duePaths(): readonly string[];
  addDeletedDir(dir: DeletedDir): void;
  /** The deepest registered directory D with `D + "/"` a prefix of `path`. O(depth). */
  deepestDeletedDir(path: string): DeletedDir | undefined;
  deletedDirs(): readonly DeletedDir[];
  rememberArchived(pageId: string, archived: ArchivedByInbound): void;
  archived(pageId: string): ArchivedByInbound | undefined;
  forgetArchived(pageId: string): void;
  /** Drops every timer and memory; later calls are no-ops (B5). */
  dispose(): void;
}

export interface PendingDeps {
  schedule: Schedule;
  /** Runs a task on the event queue (never awaited here: B8). */
  enqueue(task: () => Promise<void>): void;
  windowMs?: number;
}

type Timed<T> = { value: T; seq: number; stop: () => void };

/** O(1) per operation except deepestDeletedDir (O(depth)) and dispose (O(entries)). */
export function createInboundPending(deps: PendingDeps): InboundPending {
  const windowMs = deps.windowMs ?? INBOUND_WINDOW_MS;
  const archives = new Map<string, Timed<string>>();
  const dirs = new Map<string, Timed<DeletedDir>>();
  const restorable = new Map<string, ArchivedByInbound>();
  const due = new Map<string, string>();
  let seq = 0;
  let disposed = false;

  const expireDir = (path: string, at: number): void => {
    deps.enqueue(async () => { if (dirs.get(path)?.seq === at) dirs.delete(path); });
  };
  return {
    hasOwn: (pageId) => archives.has(pageId),
    schedule(pageId, path, onDue) {
      if (disposed) return;
      archives.get(pageId)?.stop();
      due.delete(pageId);
      const ticket: ArchiveTicket = { pageId, path, seq: ++seq };
      const fire = () => {
        due.set(pageId, path);
        deps.enqueue(() => (disposed ? Promise.resolve() : onDue(ticket)));
      };
      archives.set(pageId, { value: path, seq: ticket.seq, stop: deps.schedule(fire, windowMs) });
    },
    cancel(pageId) {
      archives.get(pageId)?.stop();
      archives.delete(pageId);
      due.delete(pageId);
    },
    claim(ticket) {
      if (disposed || archives.get(ticket.pageId)?.seq !== ticket.seq) return false;
      archives.delete(ticket.pageId);
      due.delete(ticket.pageId);
      return true;
    },
    duePaths: () => [...due.values()],
    addDeletedDir(dir) {
      if (disposed) return;
      dirs.get(dir.path)?.stop();
      const at = ++seq;
      dirs.set(dir.path, { value: dir, seq: at, stop: deps.schedule(() => expireDir(dir.path, at), windowMs) });
    },
    deepestDeletedDir: (path) => deepest(dirs, path),
    deletedDirs: () => [...dirs.values()].map((timed) => timed.value),
    rememberArchived(pageId, archived) {
      restorable.delete(pageId);
      restorable.set(pageId, archived);
      for (const oldest of restorable.keys()) {
        if (restorable.size <= ARCHIVED_BY_INBOUND_CAP) break;
        restorable.delete(oldest);
      }
    },
    archived(pageId) {
      const hit = restorable.get(pageId);
      if (hit === undefined) return undefined;
      restorable.delete(pageId);
      restorable.set(pageId, hit);
      return hit;
    },
    forgetArchived: (pageId) => { restorable.delete(pageId); },
    dispose() {
      disposed = true;
      for (const timed of [...archives.values(), ...dirs.values()]) timed.stop();
      archives.clear();
      dirs.clear();
      restorable.clear();
      due.clear();
    },
  };
}

/** Walks `path`'s directory prefixes from the deepest up. O(depth) map hits. */
function deepest(dirs: ReadonlyMap<string, Timed<DeletedDir>>, path: string): DeletedDir | undefined {
  for (let cut = path.lastIndexOf("/"); cut > 0; cut = path.lastIndexOf("/", cut - 1)) {
    const hit = dirs.get(path.slice(0, cut));
    if (hit !== undefined) return hit.value;
  }
  return undefined;
}
