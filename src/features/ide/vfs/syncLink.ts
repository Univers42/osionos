/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   syncLink.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isFsError } from "./errors";
import { collectBytes } from "./bytes";
import { joinV, type VPath } from "./vpath";
import type { FsProvider } from "./types";

/** One side of a sync link: a provider + the subtree root inside it. */
export type MirrorEndpoint = { provider: FsProvider; root: VPath };

export type MirrorOptions = {
  /** Entry NAMES skipped wherever they appear (node_modules, .git, …). */
  ignoreNames?: ReadonlySet<string>;
  /** Files larger than this are counted as skipped, never truncated. */
  maxFileBytes?: number;
  /** Hard cap on mirrored files — the remainder is counted as skipped. */
  maxFiles?: number;
  /** Loop-prevention seam: materialize records echo hashes here. */
  beforeWrite?: (relPath: string, bytes: Uint8Array) => void | Promise<void>;
};

export type MirrorReport = {
  written: number;
  failed: { relPath: string; code: string }[];
  skipped: number;
};

/** The SyncLink's first primitive (ADR-001 §7): one-direction tree mirror over
 *  ANY two providers — this is what `materialize` becomes. Per-entry failures
 *  are collected, never silent; caps produce `skipped` counts, never lies. */
export async function mirrorTree(from: MirrorEndpoint, to: MirrorEndpoint, opts: MirrorOptions = {}): Promise<MirrorReport> {
  const report: MirrorReport = { written: 0, failed: [], skipped: 0 };
  const maxFiles = opts.maxFiles ?? Number.POSITIVE_INFINITY;
  const maxBytes = opts.maxFileBytes ?? Number.POSITIVE_INFINITY;

  const ensureDir = async (path: VPath): Promise<void> => {
    try {
      await to.provider.mkdir(path);
    } catch (error) {
      if (!(isFsError(error) && error.code === "AlreadyExists")) throw error;
    }
  };

  const walk = async (fromDir: VPath, toDir: VPath, relPrefix: string): Promise<void> => {
    for (const entry of await from.provider.list(fromDir)) {
      if (opts.ignoreNames?.has(entry.name)) continue;
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      try {
        if (entry.kind === "dir") {
          await ensureDir(joinV(toDir, entry.name));
          await walk(joinV(fromDir, entry.name), joinV(toDir, entry.name), relPath);
          continue;
        }
        if (entry.kind !== "file") {
          report.skipped += 1;
          continue;
        }
        if (report.written >= maxFiles) {
          report.skipped += 1;
          continue;
        }
        const stat = await from.provider.stat(joinV(fromDir, entry.name));
        if (stat.sizeBytes > maxBytes) {
          report.skipped += 1;
          continue;
        }
        const bytes = await collectBytes(await from.provider.read(joinV(fromDir, entry.name)));
        await opts.beforeWrite?.(relPath, bytes);
        await to.provider.write(joinV(toDir, entry.name), bytes);
        report.written += 1;
      } catch (error) {
        report.failed.push({ relPath, code: isFsError(error) ? error.code : "Io" });
      }
    }
  };

  await walk(from.root, to.root, "");
  return report;
}
