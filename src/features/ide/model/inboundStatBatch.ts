/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundStatBatch.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { StatResult } from "./inboundArchive";

// The archive check stats a deleted page's path before trashing the page, one
// sandbox request per page on the serial event queue. `rm -rf` of two cloned 42
// projects (1 300 files) queued 1 307 stats, two minutes in which every later
// shell event waited: a file recreated at a deleted path opened with its old page
// text, and a freshly made file had no page to open (live VM, 2026-10-14). Here a
// stat that misses asks for every path whose archive is due in the same request,
// and the following archive checks read their answer from it.
//
// Caveat: an answer is up to `ttlMs` old when it is used, so a file deleted and made again
// inside that window reads "absent" and its page goes to the trash. The write queued behind
// it makes a new page from the file (a code file: a new id, the old page left in the trash)
// or restores the same page (an .omd naming its id). The file itself survives only because
// the writer never removes a page the shell deleted (ideSyncEngine markShellArchived): until
// then its remove deleted such files, 211 of a re-clone on the live VM (2026-10-14).
// Directories are never answered from here (ExecContext.statDir): a stale "absent" on one
// sends every page under it to the trash with it.

/** One request for many paths; a path left out of the answer is asked alone. */
export type StatMany = (paths: readonly string[]) => Promise<ReadonlyMap<string, StatResult>>;

export interface BatchedStatDeps {
  stat(path: string): Promise<StatResult>;
  statMany: StatMany;
  /** Paths whose archive is due and not yet checked. */
  duePaths(): readonly string[];
  now?: () => number;
  ttlMs?: number;
}

// The fs `hashes` op takes 1000 paths; half of that keeps one batch one exec.
const BATCH_PATHS = 500;
const DEFAULT_TTL_MS = 2_000;

/** A `stat` that batches its misses with the due paths. Each answer is used once. */
export function createBatchedStat(deps: BatchedStatDeps): (path: string) => Promise<StatResult> {
  const now = deps.now ?? Date.now;
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const answers = new Map<string, { result: StatResult; at: number }>();
  return async (path) => {
    const hit = answers.get(path);
    answers.delete(path);
    if (hit !== undefined && now() - hit.at <= ttlMs) return hit.result;
    const batch = [...new Set([path, ...deps.duePaths()])].slice(0, BATCH_PATHS);
    let results: ReadonlyMap<string, StatResult>;
    try {
      results = await deps.statMany(batch);
    } catch {
      return deps.stat(path);
    }
    answers.clear();
    const at = now();
    for (const [other, result] of results) if (other !== path) answers.set(other, { result, at });
    return results.get(path) ?? deps.stat(path);
  };
}
