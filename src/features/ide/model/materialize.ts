/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   materialize.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { buildVPath } from "../vfs/vpath";
import { createPageProvider } from "../vfs/pageProvider";
import { createSandboxProvider } from "../vfs/sandboxProvider";
import { bridgeFsTransport } from "../vfs/bridgeTransport";
import { mirrorTree } from "../vfs/syncLink";
import { bytesToText } from "../vfs/bytes";
import { pageStoreFacade } from "./pageStoreFacade";
import { recordEditorHash, sha16 } from "./ideFsEcho";

const MAX_MATERIALIZE_FILES = 500;
const MAX_FILE_BYTES = 512 * 1024;

/**
 * Push the canonical page tree → real files in the sandbox volume (P4) so a
 * freshly attached sandbox starts populated. Now the first VFS SyncLink
 * consumer (ADR-001 §7): a provider-to-provider mirror — the page tree and the
 * sandbox are just two mounts. Echo hashes are recorded per write (the
 * beforeWrite seam), so the fs-agent's re-emission never loops back into the
 * page store. Caps surface as counts, never silently.
 */
export async function materializeWorkspace(
  workspaceId: string,
  _pages: PageEntry[],
): Promise<{ written: number; failed: number }> {
  if (!workspaceId) return { written: 0, failed: 0 };
  const pages = createPageProvider("osionos", pageStoreFacade(workspaceId));
  const sandbox = createSandboxProvider("sandbox", bridgeFsTransport(workspaceId));
  const report = await mirrorTree(
    { provider: pages, root: buildVPath("osionos", workspaceId, []) },
    { provider: sandbox, root: buildVPath("sandbox", workspaceId, []) },
    {
      maxFiles: MAX_MATERIALIZE_FILES,
      maxFileBytes: MAX_FILE_BYTES,
      beforeWrite: async (_relPath, bytes) => recordEditorHash(await sha16(bytesToText(bytes))),
    },
  );
  return { written: report.written, failed: report.failed.length + report.skipped };
}
