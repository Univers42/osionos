/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   outboundWorld.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The outbound writer over an inbound world's sandbox: a snapshot of the page
// tree, the writer's io with every write logged, and one writer round from a
// snapshot to now — what the page-file writer hook does after a store change.

import { bytesToText, collectBytes } from "../../../src/features/ide/vfs/bytes.ts";
import { buildVPath } from "../../../src/features/ide/vfs/vpath.ts";
import { planOutbound, type Snapshot } from "../../../src/features/page-file/model/outboundPlan.ts";
import { runOutbound, type OutboundIo } from "../../../src/features/page-file/model/outboundRun.ts";
import { pageIndexFor } from "../../../src/features/page-file/model/pageIndexCache.ts";
import { putFile, type execWorld } from "./inboundWorld.ts";

type World = Awaited<ReturnType<typeof execWorld>>;

export const snapshotOf = (world: World): Snapshot => {
  const pages = world.store.pages();
  return { index: pageIndexFor(world.workspaceId, pages), pages };
};

/** The writer's io over the world's sandbox, every write logged. */
export function sandboxIo(world: World, writes: string[]): OutboundIo {
  const at = (path: string) => buildVPath("sandbox", world.workspaceId, path.split("/"));
  return {
    read: async (path) => world.sandbox.read(at(path)).then(async (data) => bytesToText(await collectBytes(data)), () => null),
    write: async (path, content) => { writes.push(path); await putFile(world.sandbox, world.workspaceId, path, content); },
    rename: async (from, to) => world.sandbox.rename(at(from), at(to)),
    remove: async (path) => world.sandbox.delete(at(path)),
  };
}

/** One writer round from `from` to the store as it is now; returns the new snapshot. */
export async function writerRound(world: World, from: Snapshot, writes: string[]): Promise<Snapshot> {
  const next = snapshotOf(world);
  const byId = new Map(next.pages.map((entry) => [entry._id, entry]));
  await runOutbound({
    workspaceId: world.workspaceId, plan: planOutbound(from, next), io: sandboxIo(world, writes),
    pageById: (id) => byId.get(id), pathOf: (id) => next.index.pathForId(id),
  });
  return next;
}
