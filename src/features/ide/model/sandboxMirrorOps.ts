/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sandboxMirrorOps.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { buildVPath } from "../vfs/vpath";
import { createSandboxProvider } from "../vfs/sandboxProvider";
import { bridgeFsTransport } from "../vfs/bridgeTransport";
import { isFsError } from "../vfs/errors";
import { clearSyncedHash, recordSyncedHash, syncedHashOf } from "./ideSyncEngine";
import { ideOutput } from "./ideOutputBus";

const segsOf = (relPath: string): string[] => relPath.split("/").filter(Boolean);

/** Outbound delete: a page archived in the workspace removes its sandbox file
 *  too — best-effort (no sandbox = no-op), never silent on real failures. */
export async function mirrorSandboxDelete(workspaceId: string, relPath: string): Promise<void> {
  if (!workspaceId || !relPath) return;
  const sandbox = createSandboxProvider("sandbox", bridgeFsTransport(workspaceId));
  try {
    await sandbox.delete(buildVPath("sandbox", workspaceId, segsOf(relPath)), { recursive: true });
  } catch (error) {
    if (isFsError(error) && (error.code === "NotFound" || error.code === "Unsupported")) return;
    ideOutput("fs-sync", `delete of ${relPath} did not reach the sandbox (${isFsError(error) ? error.code : "Io"})`);
  } finally {
    clearSyncedHash(workspaceId, relPath);
  }
}

/** Outbound rename/move: the sandbox file follows the page — the fix for the
 *  stale-twin bug (rename used to leave BOTH names on disk). The sync ledger
 *  entry moves with it. */
export async function mirrorSandboxRename(workspaceId: string, fromRel: string, toRel: string): Promise<void> {
  if (!workspaceId || !fromRel || !toRel || fromRel === toRel) return;
  const sandbox = createSandboxProvider("sandbox", bridgeFsTransport(workspaceId));
  try {
    await sandbox.rename(
      buildVPath("sandbox", workspaceId, segsOf(fromRel)),
      buildVPath("sandbox", workspaceId, segsOf(toRel)),
      { overwrite: true },
    );
    const agreed = syncedHashOf(workspaceId, fromRel);
    if (agreed) recordSyncedHash(workspaceId, toRel, agreed);
  } catch (error) {
    if (isFsError(error) && (error.code === "NotFound" || error.code === "Unsupported")) return;
    ideOutput("fs-sync", `rename ${fromRel} → ${toRel} did not reach the sandbox (${isFsError(error) ? error.code : "Io"})`);
  } finally {
    clearSyncedHash(workspaceId, fromRel);
  }
}
