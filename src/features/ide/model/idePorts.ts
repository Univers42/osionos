/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   idePorts.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { IDE_BASE } from "../api/ideToken";
import { ideFetch, type IdeTransport } from "../api/ideTransport";

export type SandboxPort = { port: number; address: string };

/** Parse `ss -tln` / `netstat -tln` listening rows into unique ports. Pure and
 *  format-tolerant: any LISTEN row's first `addr:port` token wins. */
export function parsePortsOutput(output: string): SandboxPort[] {
  const byPort = new Map<number, SandboxPort>();
  for (const line of output.replace(/\r/g, "").split("\n")) {
    if (!/\bLISTEN\b/i.test(line)) continue;
    for (const token of line.trim().split(/\s+/)) {
      const match = /^(.*):(\d{1,5})$/.exec(token);
      if (!match || match[2] === "*") continue;
      const port = Number(match[2]);
      if (port > 0 && port < 65536 && !byPort.has(port)) {
        byPort.set(port, { port, address: match[1] || "*" });
      }
      break; // first addr:port token per row is the local address
    }
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port);
}

export interface PortPreviewDeps {
  ideFetch: IdeTransport["ideFetch"];
  ideBase: () => string;
  open: (url: string, target: string, features: string) => void;
}

/** True only for an absolute http(s) URL on the IDE origin: the server's answer is
 *  followed by window.open, so it must not be able to send the user elsewhere. */
function isIdeOriginUrl(candidate: unknown, ideBase: string): candidate is string {
  if (typeof candidate !== "string" || ideBase === "") return false;
  try {
    const url = new URL(candidate);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === new URL(ideBase).origin;
  } catch {
    return false;
  }
}

/** Ask the IDE server for a preview URL of a forwarded port and open it in a new tab.
 *  The tunnel rides the exec channel — no new network path. */
export function createPortPreview(deps: PortPreviewDeps): (workspaceId: string, port: number) => Promise<boolean> {
  return async (workspaceId, port) => {
    if (!workspaceId) return false;
    try {
      const result = await deps.ideFetch(workspaceId, "/api/ide/preview/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, port }),
      });
      if (result.kind !== "response" || !result.response.ok) return false;
      const body = (await result.response.json().catch(() => null)) as { ok?: unknown; url?: unknown } | null;
      if (body?.ok !== true || !isIdeOriginUrl(body.url, deps.ideBase())) return false;
      deps.open(body.url, "_blank", "noopener,noreferrer");
      return true;
    } catch {
      return false;
    }
  };
}

export const openPortPreview = createPortPreview({
  ideFetch,
  ideBase: () => IDE_BASE,
  open: (url, target, features) => void window.open(url, target, features),
});

/** Ask the IDE server for the sandbox's listening TCP ports. Empty on any failure —
 *  the panel renders the honest empty state instead of throwing. */
export async function fetchSandboxPorts(workspaceId: string): Promise<SandboxPort[]> {
  if (!workspaceId) return [];
  try {
    const result = await ideFetch(workspaceId, "/api/ide/ports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    if (result.kind !== "response" || !result.response.ok) return [];
    const body = (await result.response.json()) as { output?: string };
    return parsePortsOutput(String(body.output ?? ""));
  } catch {
    return [];
  }
}
