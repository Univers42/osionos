/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-writer-fixtures.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { pageIndexFor } from "../../src/features/page-file/model/pageIndexCache.ts";
import type { OutboundPlan, Snapshot } from "../../src/features/page-file/model/outboundPlan.ts";
import type { OutboundIo, OutboundRunCtx } from "../../src/features/page-file/model/outboundRun.ts";
import { page } from "./page-tree-fixtures.ts";

// The ledger and the index cache are module-level, so each test uses its own workspace id.
let wsCounter = 0;
export const freshWs = (): string => `ws-pfw-${(wsCounter += 1)}`;
export const block = (text: string): Block => ({ id: "b1", type: "paragraph", content: text });
export const cp = (id: string, title: string, parent: string | null, surface: PageEntry["surface"] = "page", content: Block[] = []): PageEntry => ({ ...page(id, title, parent, surface), content });
export const snap = (ws: string, pages: PageEntry[]): Snapshot => ({ index: pageIndexFor(ws, pages), pages });
export type World = { io: OutboundIo; files: Map<string, string>; removals: string[] };
/** A file rename, or a dir rename moving every path under `from/`; refuses an existing
 *  target and a missing source, like the sandbox. */
function renameIn(files: Map<string, string>, from: string, to: string): void {
  if (files.has(to) || [...files.keys()].some((path) => path.startsWith(`${to}/`))) throw new Error("target exists");
  const under = [...files.keys()].filter((path) => path.startsWith(`${from}/`));
  if (!files.has(from) && under.length === 0) throw new Error("source missing");
  if (files.has(from)) files.set(to, files.get(from) ?? "");
  files.delete(from);
  for (const path of under) {
    files.set(to + path.slice(from.length), files.get(path) ?? "");
    files.delete(path);
  }
}
/** In-memory io: read null when absent; rename as renameIn. */
export function world(seed: Record<string, string> = {}, failWrites: string[] = []): World {
  const files = new Map(Object.entries(seed));
  const removals: string[] = [];
  return {
    io: {
      read: async (path) => files.get(path) ?? null,
      write: async (path, content) => { if (failWrites.includes(path)) throw new Error("injected write failure"); files.set(path, content); },
      rename: async (from, to) => renameIn(files, from, to),
      remove: async (path) => { removals.push(path); files.delete(path); },
    },
    files,
    removals,
  };
}
export function ctxFor(ws: string, plan: OutboundPlan, pages: PageEntry[], io: OutboundIo): OutboundRunCtx {
  const index = pageIndexFor(ws, pages);
  const byId = new Map(pages.map((p) => [p._id, p]));
  return { workspaceId: ws, plan, pageById: (id) => byId.get(id), pathOf: (id) => index.pathForId(id), io };
}
