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

// The IDE server's WebSocket close codes (the same set the main bridge used, see
// scripts/bridge-ide-exec.mjs:22-24). 1000 = normal end (shell exit); 4029 = throttled
// and 4011 = IDE token expired are the only 4xxx worth retrying (4011 with a fresh token).
// 4137 = language server out of memory (OOM kill, exit 137).
export const IDE_TOKEN_EXPIRED_CLOSE = 4011;
export const LSP_OUT_OF_MEMORY_CLOSE = 4137;

const CLOSE_HEALTH: Readonly<Record<number, SandboxHealthState>> = {
  4001: "disabled", // auth refused: no usable session for the sandbox
  4003: "disabled", // server gate off (OSIONOS_IDE_SANDBOX / docker host unset)
  4004: "unavailable", // no sandbox: daemon unreachable or container not running
};

/** True when the server closed on purpose: reconnecting cannot help. */
export function isDeliberateClose(code: number): boolean {
  return code === 1000 || (code >= 4000 && code !== 4029 && code !== IDE_TOKEN_EXPIRED_CLOSE);
}

/** True when the IDE server closed because the short-lived token ran out. */
export function isTokenExpiredClose(code: number): boolean {
  return code === IDE_TOKEN_EXPIRED_CLOSE;
}

/** True when the LSP connection closed because the language server was OOM-killed (exit 137). */
export function isLspOutOfMemoryClose(code: number): boolean {
  return code === LSP_OUT_OF_MEMORY_CLOSE;
}

/** The sandbox health a close code proves, or null when it says nothing about it. */
export function healthFromCloseCode(code: number): SandboxHealthState | null {
  return CLOSE_HEALTH[code] ?? null;
}
