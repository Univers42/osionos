/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridgeTransport.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ideFetch } from "../api/ideTransport";
import { fsError } from "./errors";
import type { FsOpTransport } from "./sandboxFsOps";

/** Production transport for the sandbox:// provider: POST /api/ide/fs with an
 *  `op`. HTTP-layer failures map here; op-level failures ride the exec result
 *  and map in sandboxFsOps. */
export function bridgeFsTransport(workspaceId: string): FsOpTransport {
  return async (op, params) => {
    if (!workspaceId) throw fsError("Unsupported", undefined, "bridge unavailable (no session)");
    let result: Awaited<ReturnType<typeof ideFetch>>;
    try {
      result = await ideFetch(workspaceId, "/api/ide/fs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, op, ...params }),
      });
    } catch (cause) {
      throw fsError("Io", undefined, `bridge unreachable: ${String(cause)}`);
    }
    if (result.kind === "unavailable") throw fsError("Unsupported", undefined, `bridge unavailable (${result.reason})`);
    const response = result.response;
    if (response.status === 401 || response.status === 403) throw fsError("PermissionDenied", undefined, `bridge ${response.status}`);
    if (response.status === 404) throw fsError("Unsupported", undefined, "IDE sandbox is not enabled");
    if (response.status === 409) throw fsError("Io", undefined, "no running sandbox");
    if (!response.ok) throw fsError("Io", undefined, `bridge ${response.status}`);
    const body = (await response.json()) as { exitCode?: number | null; output?: string };
    return { exitCode: body.exitCode ?? 1, output: String(body.output ?? "") };
  };
}
