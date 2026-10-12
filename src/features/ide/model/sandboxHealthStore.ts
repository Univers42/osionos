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

import { useEffect } from "react";
import { create } from "zustand";

import { API_BASE, getActivePageJwt } from "@/shared/api/client";

import { createHealthCore } from "./sandboxHealthCore";

/**
 * One answer to "can the IDE sandbox be used right now?", shared by the
 * terminal, fs-sync, ports, run and the status bar so none of them retries on
 * its own. Probed via GET /api/ide/session (scripts/bridge-ide-sandbox.mjs:169-178):
 *   online      200 {status:"running"}
 *   stopped     200 {status:"stopped"} — backend reachable; ensure() starts it
 *   disabled    404, or no API_BASE / no session (offline build, signed out)
 *   unavailable 502 or network error — Plane B daemon down
 *   unknown     not probed yet
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

const core = createHealthCore({
  fetch: (url, init) => fetch(url, init),
  apiBase: () => API_BASE,
  jwt: getActivePageJwt,
  now: () => Date.now(),
});

export const useSandboxHealthStore = create<SandboxHealth>(() => ({
  ...core.snapshot(),
  probe: core.probe,
  ensure: core.ensure,
  markClosed: core.markClosed,
  retry: core.retry,
}));

core.subscribe((snap) => useSandboxHealthStore.setState(snap));

export function isSandboxOnline(state: SandboxHealthState): boolean {
  return state === "online";
}

/** May a terminal dial the bridge? Its connect starts a stopped sandbox
 *  (bridge-ide-exec.mjs ensureSandbox), so only disabled/unavailable refuse. */
export function isSandboxReachable(state: SandboxHealthState): boolean {
  return state !== "disabled" && state !== "unavailable";
}

// Ponytail: a sandbox that comes back is seen up to 60 s late; Retry is immediate.
export const HEALTH_POLL_MS = 60_000;

/** Probe on mount and keep the state fresh while it is not online. */
export function useSandboxHealthProbe(workspaceId: string, enabled: boolean): SandboxHealthState {
  const state = useSandboxHealthStore((s) => s.state);
  const probe = useSandboxHealthStore((s) => s.probe);

  useEffect(() => {
    if (!enabled || workspaceId === "") return;
    void probe(workspaceId);
  }, [enabled, workspaceId, probe]);

  useEffect(() => {
    if (!enabled || workspaceId === "" || state === "online") return;
    const timer = setInterval(() => void probe(workspaceId), HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, workspaceId, state, probe]);

  return state;
}
