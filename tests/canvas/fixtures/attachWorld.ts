/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   attachWorld.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The inbound world plus what the attach tests need: attach itself, the
// sandbox read back as text, and a sandbox that runs a hook after one call —
// the app acting while attach is mid-flight.

import type { PageEntry } from "../../../src/entities/page/model/types.ts";
import { sha16 } from "../../../src/features/ide/model/ideFsEcho.ts";
import { recordSyncedHash } from "../../../src/features/ide/model/ideSyncEngine.ts";
import { attachWorkspace } from "../../../src/features/ide/model/materialize.ts";
import { collectBytes, bytesToText } from "../../../src/features/ide/vfs/bytes.ts";
import { buildVPath } from "../../../src/features/ide/vfs/vpath.ts";
import type { FsProvider } from "../../../src/features/ide/vfs/types.ts";
import { pageFileText } from "../../../src/features/page-file/model/pageFileText.ts";
import { blockPage, execWorld, putFile } from "./inboundWorld.ts";

export type World = Awaited<ReturnType<typeof execWorld>>;

/** The sandbox file at `path` as text, or null when it is absent. */
export async function fileIn(world: World, path: string): Promise<string | null> {
  try {
    return bytesToText(await collectBytes(await world.sandbox.read(buildVPath(world.sandbox.scheme, world.workspaceId, path.split("/")))));
  } catch {
    return null;
  }
}

/** The page's file text as the app has it now ("" when the page is gone). */
export const textOf = (world: World, id: string): string => {
  const entry = world.pageOf(id);
  return entry === undefined ? "" : pageFileText(entry);
};

export const attach = (world: World, provider: FsProvider = world.sandbox) =>
  attachWorkspace({ workspaceId: world.workspaceId, session: world.session, provider });

/** Page A agreed on in the ledger, then edited in the shell while the app was away. */
export async function editedWhileAway(pages: PageEntry[] = [blockPage("A", "A")]) {
  const world = await execWorld(pages);
  const ours = textOf(world, "A");
  recordSyncedHash(world.workspaceId, "A.omd", await sha16(ours));
  const theirs = `${ours.slice(0, ours.lastIndexOf("---\n") + 4)}edited in the shell\n`;
  await putFile(world.sandbox, world.workspaceId, "A.omd", theirs);
  return { world, ours, theirs };
}

/** The sandbox, running `hook` once right after the first `op` call on `path` resolves. */
export function hooked(world: World, op: "read" | "write", path: string, hook: () => void): FsProvider {
  const base = world.sandbox;
  let fired = false;
  const after = <T>(segments: readonly string[], result: T): T => {
    if (!fired && segments.join("/") === path) {
      fired = true;
      hook();
    }
    return result;
  };
  if (op === "read") return { ...base, read: async (vpath, opts) => after(vpath.segments, await base.read(vpath, opts)) };
  return { ...base, write: async (vpath, data, opts) => after(vpath.segments, await base.write(vpath, data, opts)) };
}
