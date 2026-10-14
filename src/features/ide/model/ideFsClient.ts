/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideFsClient.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { bridgeFsTransport } from "../vfs/bridgeTransport";
import { textToBytes } from "../vfs/bytes";
import { bytesToBase64, type FsOpTransport } from "../vfs/sandboxFsOps";
import { sha16 } from "./ideFsEcho";
import { ideOutput } from "./ideOutputBus";
import { recordOutboundWrite } from "./ideSyncEngine";

export { isEchoHash, parseFsEvent, recordEditorHash, sha16, type FsEvent } from "./ideFsEcho";

type QueuedSave = { content: string; transport: FsOpTransport; waiters: ((written: boolean) => void)[] };

// One file's saves, in order. A key is present while a save of that file is in
// flight; its value is the newest content waiting behind it (null: none). The 429
// retry let an older save land last: save A retried for 3.75 s, save B (1.2 s
// later) landed first, A overwrote it in the sandbox, and A's fs event, against a
// ledger already at B, reverted the page to A under an editor still showing B.
const inFlight = new Map<string, QueuedSave | null>();

/** Write one file into the sandbox (P4), after any save of that file still in
 *  flight; saves queued behind it collapse to the newest, and every caller
 *  learns whether the content that superseded theirs was written. It rides the
 *  fs transport (staged pieces, the 429 retry): its own request had no retry, and
 *  a paste saved during a burst of other fs ops never reached the sandbox. */
export function ideFsWrite(
  workspaceId: string,
  path: string,
  content: string,
  transport: FsOpTransport = bridgeFsTransport(workspaceId),
): Promise<boolean> {
  if (!workspaceId || !path) return Promise.resolve(false);
  const key = `${workspaceId}\0${path}`;
  return new Promise((resolve) => {
    if (inFlight.has(key)) {
      inFlight.set(key, { content, transport, waiters: [...(inFlight.get(key)?.waiters ?? []), resolve] });
      return;
    }
    inFlight.set(key, null);
    void drainSaves(workspaceId, path, key, { content, transport, waiters: [resolve] });
  });
}

async function drainSaves(workspaceId: string, path: string, key: string, first: QueuedSave): Promise<void> {
  for (let save: QueuedSave | null = first; save !== null; ) {
    // A throw before the request (the ledger's storage) must not wedge this file's queue.
    const written = await writeNow(workspaceId, path, save.content, save.transport).catch(() => false);
    for (const waiter of save.waiters) waiter(written);
    save = inFlight.get(key) ?? null;
    if (save === null) inFlight.delete(key);
    else inFlight.set(key, null);
  }
}

/** Records the echo hash first so the fs-agent's re-emission of this exact content
 *  is suppressed, and the sync ledger so this content is the new agreed state
 *  (three-way conflicts) — rolled back when the write fails, which Output names. */
async function writeNow(workspaceId: string, path: string, content: string, transport: FsOpTransport): Promise<boolean> {
  const undo = recordOutboundWrite(workspaceId, path, await sha16(content));
  let reason: string;
  try {
    const result = await transport("write", { path, contentBase64: bytesToBase64(textToBytes(content)) });
    if (result.exitCode === 0) return true;
    reason = `exit ${String(result.exitCode)}`;
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }
  undo();
  ideOutput("fs-sync", `${path}: not saved to the sandbox — ${reason}`);
  return false;
}
