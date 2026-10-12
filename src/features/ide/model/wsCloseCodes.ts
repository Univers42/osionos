/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   wsCloseCodes.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SandboxHealthState } from "./sandboxHealthStore";

// The bridge's IDE WebSocket close codes (scripts/bridge-ide-exec.mjs:22-24).
// 1000 = normal end (shell exit); 4029 = throttled, the only 4xxx worth retrying.
const CLOSE_HEALTH: Readonly<Record<number, SandboxHealthState>> = {
  4001: "disabled", // auth refused: no usable session for the sandbox
  4003: "disabled", // server gate off (OSIONOS_IDE_SANDBOX / docker host unset)
  4004: "unavailable", // no sandbox: daemon unreachable or container not running
};

/** True when the server closed on purpose: reconnecting cannot help. */
export function isDeliberateClose(code: number): boolean {
  return code === 1000 || (code >= 4000 && code !== 4029);
}

/** The sandbox health a close code proves, or null when it says nothing about it. */
export function healthFromCloseCode(code: number): SandboxHealthState | null {
  return CLOSE_HEALTH[code] ?? null;
}
