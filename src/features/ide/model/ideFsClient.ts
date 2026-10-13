/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideFsClient.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ideFetch } from "../api/ideTransport";
import { sha16 } from "./ideFsEcho";
import { recordOutboundWrite } from "./ideSyncEngine";

export { isEchoHash, parseFsEvent, recordEditorHash, sha16, type FsEvent } from "./ideFsEcho";

/** Write one file into the sandbox (P4). Records the echo hash first so the
 *  fs-agent's re-emission of this exact content is suppressed, and the sync
 *  ledger so this content is the new agreed state (three-way conflicts) —
 *  rolled back when the write fails. The bridge answers 200 with `ok: false`
 *  when the in-sandbox write exits non-zero, so the body decides, not the status. */
export async function ideFsWrite(workspaceId: string, path: string, content: string): Promise<boolean> {
  if (!workspaceId || !path) return false;
  const undo = recordOutboundWrite(workspaceId, path, await sha16(content));
  try {
    const result = await ideFetch(workspaceId, "/api/ide/fs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, path, content }),
    });
    const res = result.kind === "response" ? result.response : null;
    const body = (await res?.json().catch(() => null)) as { ok?: unknown } | null;
    const written = res !== null && res.ok && body?.ok !== false;
    if (!written) undo();
    return written;
  } catch {
    undo();
    return false;
  }
}
