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

import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { recordEditorHash, sha16 } from "./ideFsEcho";

export { isEchoHash, parseFsEvent, recordEditorHash, sha16, type FsEvent } from "./ideFsEcho";

/** Write one file into the sandbox (P4). Records the echo hash first so the
 *  fs-agent's re-emission of this exact content is suppressed. */
export async function ideFsWrite(workspaceId: string, path: string, content: string): Promise<boolean> {
  const jwt = getActivePageJwt();
  if (!API_BASE || !jwt || !workspaceId || !path) return false;
  recordEditorHash(await sha16(content));
  try {
    const res = await fetch(`${API_BASE}/api/ide/fs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ workspaceId, path, content }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
