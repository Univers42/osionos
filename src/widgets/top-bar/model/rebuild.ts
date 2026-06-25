/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   rebuild.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Client side of the host rebuild daemon (scripts/dev-rebuild-server.mjs). A
 * browser button cannot run host `make`/docker, so the Update button talks to
 * this localhost helper. 127.0.0.1 is used (not localhost) to match the project's
 * IPv4 loopback convention and stay mixed-content-exempt from the HTTPS app.
 */

const REBUILD_BASE = (
  (import.meta.env as Record<string, string>)["VITE_REBUILD_URL"] || "http://127.0.0.1:7799"
).replace(/\/$/, "");

export interface RebuildResult {
  ok: boolean;
  code?: number;
  message?: string;
}

/** Is the host rebuild daemon reachable? (Fast probe; failure ⇒ daemon not running.) */
export async function rebuildServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${REBUILD_BASE}/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Trigger `make all` on the host. Resolves when the rebuild finishes (minutes). */
export async function runHostRebuild(): Promise<RebuildResult> {
  try {
    const res = await fetch(`${REBUILD_BASE}/rebuild`, { method: "POST" });
    if (res.status === 409) return { ok: false, message: "A rebuild is already running." };
    const body = (await res.json().catch(() => ({}))) as RebuildResult;
    return { ok: Boolean(body.ok), code: body.code, message: body.message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Rebuild request failed." };
  }
}
