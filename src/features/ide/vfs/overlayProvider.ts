/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   overlayProvider.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { fsError, isFsError } from "./errors";
import { collectBytes } from "./bytes";
import { buildVPath, type VPath } from "./vpath";
import type { FsProvider, ListedEntry } from "./types";

/** Union provider (ADR-001 §2): reads fall through upper → lower, writes land
 *  in upper, deletes of lower-only entries become whiteouts. "Hybrid" is thus
 *  just another leaf — proof the abstraction composes. Itself conformance-run. */
export function createOverlayProvider(scheme: string, upper: FsProvider, lower: FsProvider): FsProvider {
  const whiteouts = new Set<string>();
  const on = (provider: FsProvider, path: VPath): VPath => buildVPath(provider.scheme, path.authority, path.segments);
  const hidden = (path: VPath): boolean => whiteouts.has(path.compareKey);

  const notFoundOnly = (error: unknown): void => {
    if (!(isFsError(error) && error.code === "NotFound")) throw error;
  };

  const upperMkdirp = async (path: VPath): Promise<void> => {
    for (let depth = 1; depth <= path.segments.length; depth++) {
      const partial = buildVPath(upper.scheme, path.authority, path.segments.slice(0, depth));
      try {
        await upper.mkdir(partial);
      } catch (error) {
        if (!(isFsError(error) && error.code === "AlreadyExists")) throw error;
      }
    }
  };

  return {
    scheme,
    capabilities() {
      const base = upper.capabilities();
      return { ...base, atomicRename: false, watch: "poll", pollIntervalMs: 2000 };
    },
    async stat(path) {
      try {
        return await upper.stat(on(upper, path));
      } catch (error) {
        notFoundOnly(error);
      }
      if (hidden(path)) throw fsError("NotFound", path.uri);
      return lower.stat(on(lower, path));
    },
    async list(path) {
      const names = new Map<string, ListedEntry>();
      try {
        for (const entry of await lower.list(on(lower, path))) {
          const childKey = path.segments.length === 0
            ? entry.name.normalize("NFC")
            : `${path.compareKey}/${entry.name.normalize("NFC")}`;
          if (!whiteouts.has(childKey)) names.set(entry.name, entry);
        }
      } catch (error) {
        notFoundOnly(error);
      }
      try {
        for (const entry of await upper.list(on(upper, path))) names.set(entry.name, entry);
      } catch (error) {
        notFoundOnly(error);
        if (names.size === 0) throw error;
      }
      return [...names.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },
    async read(path, opts) {
      try {
        return await upper.read(on(upper, path), opts);
      } catch (error) {
        notFoundOnly(error);
      }
      if (hidden(path)) throw fsError("NotFound", path.uri);
      return lower.read(on(lower, path), opts);
    },
    async write(path, data, opts) {
      if (opts?.overwrite === false || opts?.create === false) {
        const exists = await this.stat(path).then(() => true, () => false);
        if (exists && opts.overwrite === false) throw fsError("AlreadyExists", path.uri);
        if (!exists && opts.create === false) throw fsError("NotFound", path.uri);
      }
      const parentSegments = path.segments.slice(0, -1);
      if (parentSegments.length > 0) await upperMkdirp(buildVPath(upper.scheme, path.authority, parentSegments));
      await upper.write(on(upper, path), data, { create: true, overwrite: true });
      whiteouts.delete(path.compareKey);
    },
    async mkdir(path) {
      const exists = await this.stat(path).then(() => true, () => false);
      if (exists) throw fsError("AlreadyExists", path.uri);
      await upperMkdirp(path);
      whiteouts.delete(path.compareKey);
    },
    async delete(path, opts) {
      let found = false;
      try {
        await upper.delete(on(upper, path), opts);
        found = true;
      } catch (error) {
        notFoundOnly(error);
      }
      const inLower = await lower.stat(on(lower, path)).then(() => true, () => false);
      if (inLower && !hidden(path)) {
        whiteouts.add(path.compareKey);
        found = true;
      }
      if (!found) throw fsError("NotFound", path.uri);
    },
    async rename(from, to, opts) {
      const stat = await this.stat(from);
      if (stat.kind !== "file") throw fsError("Unsupported", from.uri, "overlay renames files only");
      const existing = await this.stat(to).then(() => true, () => false);
      if (existing && !opts?.overwrite) throw fsError("AlreadyExists", to.uri);
      const bytes = await collectBytes(await this.read(from));
      await this.write(to, bytes);
      await this.delete(from);
    },
    async watch(path, onEvent, signal) {
      const asOverlay = (eventPath: VPath): VPath => buildVPath(scheme, eventPath.authority, eventPath.segments);
      await Promise.all([
        upper.watch(on(upper, path), (event) => onEvent({ ...event, path: asOverlay(event.path) }), signal),
        lower.watch(on(lower, path), (event) => { if (!hidden(event.path)) onEvent({ ...event, path: asOverlay(event.path) }); }, signal),
      ]).then(() => undefined);
    },
    async close() {
      whiteouts.clear();
    },
  };
}
