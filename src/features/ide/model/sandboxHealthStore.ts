/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sandboxHealthStore.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

import { healthFromCloseCode } from "./wsCloseCodes";

/**
 * One answer to "can the IDE sandbox be used right now?", shared by the
 * terminal, fs-sync, ports, run and the status bar so none of them retries on
 * its own. Probed via GET /api/ide/session (scripts/bridge-ide-sandbox.mjs:169-178):
 *   online      200 {status:"running"}
 *   stopped     200 {status:"stopped"} — backend reachable; ensure() starts it
 *   disabled    404, or no API_BASE / no session (offline build, signed out)
 *   unavailable 502 or network error — Plane B daemon down
 *   unknown     not probed yet
 * LANE I STUB — lane A (feat/ide-health) replaces the bodies, keeping every export.
 */
export type SandboxHealthState = "unknown" | "online" | "stopped" | "disabled" | "unavailable";

export interface SandboxHealth {
  state: SandboxHealthState;
  /** Human-readable cause shown by SandboxUnavailable; null while online/unknown. */
  reason: string | null;
  workspaceId: string | null;
  checkedAt: number | null;
  probe: (workspaceId: string) => Promise<SandboxHealthState>;
  /** POST /api/ide/session — start a stopped sandbox, then re-probe. */
  ensure: (workspaceId: string) => Promise<SandboxHealthState>;
  markClosed: (code: number, reason: string) => void;
  /** Manual Retry: probe the last workspace again (then ensure when stopped). */
  retry: () => Promise<SandboxHealthState>;
}

export const useSandboxHealthStore = create<SandboxHealth>((set, get) => ({
  state: "unknown",
  reason: null,
  workspaceId: null,
  checkedAt: null,
  probe: async (workspaceId) => {
    set({ workspaceId });
    return get().state;
  },
  ensure: async (workspaceId) => get().probe(workspaceId),
  markClosed: (code, reason) => {
    const state = healthFromCloseCode(code);
    if (state) set({ state, reason, checkedAt: Date.now() });
  },
  retry: async () => get().state,
}));

export function isSandboxOnline(state: SandboxHealthState): boolean {
  return state === "online";
}

/** May a terminal dial the bridge? Its connect starts a stopped sandbox
 *  (bridge-ide-exec.mjs ensureSandbox), so only disabled/unavailable refuse. */
export function isSandboxReachable(state: SandboxHealthState): boolean {
  return state !== "disabled" && state !== "unavailable";
}

/** Probe on mount and keep the state fresh while it is not online. */
export function useSandboxHealthProbe(workspaceId: string, enabled: boolean): SandboxHealthState {
  void workspaceId;
  void enabled;
  return useSandboxHealthStore((s) => s.state);
}
