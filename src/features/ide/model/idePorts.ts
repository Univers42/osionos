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

/** Ask the bridge for the sandbox's listening TCP ports. Empty on any failure —
 *  the panel renders the honest empty state instead of throwing. The api client
 *  is imported LAZILY so this module stays pure for the node test runner. */
export async function fetchSandboxPorts(workspaceId: string): Promise<SandboxPort[]> {
  const { API_BASE, getActivePageJwt } = await import("@/shared/api/client");
  const jwt = getActivePageJwt();
  if (!API_BASE || !jwt || !workspaceId) return [];
  try {
    const response = await fetch(`${API_BASE}/api/ide/ports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ workspaceId }),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { output?: string };
    return parsePortsOutput(String(body.output ?? ""));
  } catch {
    return [];
  }
}
