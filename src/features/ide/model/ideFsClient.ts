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

/** Write one file into the sandbox (P4). Records the echo hash first so the
 *  fs-agent's re-emission of this exact content is suppressed, and the sync
 *  ledger so this content is the new agreed state (three-way conflicts) —
 *  rolled back when the write fails, which the Output panel names. It rides the
 *  fs transport (staged pieces, the 429 retry): its own request had no retry, and
 *  a paste saved during a burst of other fs ops never reached the sandbox. */
export async function ideFsWrite(
  workspaceId: string,
  path: string,
  content: string,
  transport: FsOpTransport = bridgeFsTransport(workspaceId),
): Promise<boolean> {
  if (!workspaceId || !path) return false;
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
