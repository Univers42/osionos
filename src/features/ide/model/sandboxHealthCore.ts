/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sandboxHealthCore.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { IdeFetchResult } from "../api/ideTransport";
import type { SandboxHealthState } from "./sandboxHealthStore";
import { healthFromCloseCode } from "./wsCloseCodes";

export interface HealthSnapshot {
  state: SandboxHealthState;
  reason: string | null;
  workspaceId: string | null;
  checkedAt: number | null;
}

export interface HealthDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiBase: () => string; // "" → not configured
  jwt: () => string | null; // null → signed out
  now: () => number;
  /** When set, requests go through the IDE transport (IDE origin, IDE token) and
   *  fetch/apiBase/jwt are not consulted. */
  ideFetch?: (workspaceId: string, path: string, init: RequestInit) => Promise<IdeFetchResult>;
}

export interface HealthCore {
  snapshot: () => HealthSnapshot;
  subscribe: (listener: (snap: HealthSnapshot) => void) => () => void;
  probe: (workspaceId: string) => Promise<SandboxHealthState>;
  ensure: (workspaceId: string) => Promise<SandboxHealthState>;
  markClosed: (code: number, reason: string) => void;
  retry: () => Promise<SandboxHealthState>;
}

export const HEALTH_REASONS = Object.freeze({
  notConfigured: "The IDE sandbox is not configured for this session.",
  disabled: "The IDE sandbox is not enabled on this server.",
  forbidden: "You are not authorised to use the IDE sandbox.",
  stopped: "The sandbox is stopped.",
  unreachable: "Cannot reach the IDE bridge.",
  unexpected: "Unexpected sandbox response.",
  closedDisabled: "The IDE sandbox is not enabled on this server.",
  closedUnavailable: "The sandbox is not running on this server.",
});

/** Map a bridge response to a health verdict; "keep" (429) leaves it unchanged. O(1). */
export function stateFromResponse(
  status: number,
  body: unknown,
): { state: SandboxHealthState | "keep"; reason: string | null } {
  if (status === 200) {
    const sandboxStatus = (body as { status?: unknown } | undefined)?.status;
    if (sandboxStatus === "running") return { state: "online", reason: null };
    if (sandboxStatus === "stopped") return { state: "stopped", reason: HEALTH_REASONS.stopped };
    return { state: "unavailable", reason: HEALTH_REASONS.unexpected };
  }
  if (status === 404) return { state: "disabled", reason: HEALTH_REASONS.disabled };
  if (status === 401 || status === 403) return { state: "disabled", reason: HEALTH_REASONS.forbidden };
  if (status === 429) return { state: "keep", reason: null };
  if (status >= 500) return { state: "unavailable", reason: `Sandbox backend unavailable (HTTP ${status}).` };
  return { state: "unavailable", reason: `Unexpected sandbox response (HTTP ${status}).` };
}

/** Pure owner of "can the sandbox be used right now?" — no react/zustand/env; all inputs via deps. O(1). */
export function createHealthCore(deps: HealthDeps): HealthCore {
  let state: SandboxHealthState = "unknown";
  let reason: string | null = null;
  let workspaceId: string | null = null;
  let checkedAt: number | null = null;
  const listeners = new Set<(snap: HealthSnapshot) => void>();
  const inflight = new Map<string, Promise<SandboxHealthState>>();

  const snapshot = (): HealthSnapshot => ({ state, reason, workspaceId, checkedAt });

  const notify = (): void => {
    const snap = snapshot();
    for (const listener of [...listeners]) {
      try {
        listener(snap);
      } catch {
        // A throwing listener must not break the others or the core.
      }
    }
  };

  // A result is applied only for the workspace current when it settles; else it
  // is dropped and the caller sees the current state.
  const apply = (next: { state: SandboxHealthState; reason: string | null }, ws: string): SandboxHealthState => {
    if (workspaceId !== ws) return state;
    state = next.state;
    reason = next.reason;
    checkedAt = deps.now();
    notify();
    return state;
  };

  // "keep" leaves the verdict but still stamps checkedAt.
  const applyKeep = (ws: string): SandboxHealthState => {
    if (workspaceId !== ws) return state;
    checkedAt = deps.now();
    notify();
    return state;
  };

  // Adopting a new workspace resets the verdict; listeners hear it.
  const adopt = (ws: string): void => {
    if (workspaceId === ws) return;
    workspaceId = ws;
    state = "unknown";
    reason = null;
    notify();
  };

  // Today's mapping, kept for the IDE transport: unconfigured / refused / signed out
  // are "disabled" (a 429 keeps the verdict), a failed mint is an unreachable probe.
  const unavailableResult = (
    reason: Extract<IdeFetchResult, { kind: "unavailable" }>["reason"],
  ): { state: SandboxHealthState | "keep"; reason: string | null } => {
    if (reason === "not-allowed") return { state: "disabled", reason: HEALTH_REASONS.forbidden };
    if (reason === "throttled") return { state: "keep", reason: null };
    if (reason === "error") return { state: "unavailable", reason: HEALTH_REASONS.unreachable };
    return { state: "disabled", reason: HEALTH_REASONS.notConfigured };
  };

  // The legacy path: app origin + app token supplied directly. Null means "disabled, not configured".
  const sendDirect = async (path: string, init: RequestInit): Promise<Response | null> => {
    const base = deps.apiBase();
    const token = deps.jwt();
    if (base === "" || token === null) return null;
    const headers = { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` };
    return deps.fetch(`${base}${path}`, { ...init, headers });
  };

  // One HTTP request per workspace: a null init is the GET probe, a POST init is
  // ensure (which re-probes on 2xx). O(1).
  const request = async (ws: string, init: RequestInit | null): Promise<SandboxHealthState> => {
    adopt(ws);
    const path = init === null ? `/api/ide/session?workspaceId=${encodeURIComponent(ws)}` : "/api/ide/session";
    let response: Response;
    try {
      if (deps.ideFetch) {
        const sent = await deps.ideFetch(ws, path, init ?? {});
        if (sent.kind === "unavailable") {
          const verdict = unavailableResult(sent.reason);
          return verdict.state === "keep" ? applyKeep(ws) : apply({ state: verdict.state, reason: verdict.reason }, ws);
        }
        response = sent.response;
      } else {
        const sent = await sendDirect(path, init ?? {});
        if (sent === null) return apply({ state: "disabled", reason: HEALTH_REASONS.notConfigured }, ws);
        response = sent;
      }
    } catch {
      return apply({ state: "unavailable", reason: HEALTH_REASONS.unreachable }, ws);
    }
    if (init !== null && response.status >= 200 && response.status < 300) return request(ws, null);
    const result = stateFromResponse(response.status, await response.json().catch(() => undefined));
    if (result.state === "keep") return applyKeep(ws);
    return apply({ state: result.state, reason: result.reason }, ws);
  };

  const dedupe = (ws: string, start: () => Promise<SandboxHealthState>): Promise<SandboxHealthState> => {
    const pending = inflight.get(ws);
    if (pending) return pending;
    const promise = start();
    inflight.set(ws, promise);
    // Cleared on settle, here and not inside `request`: a signed-out probe settles before its
    // first await, so a cleanup inside it ran before this set() and pinned that verdict forever.
    const clear = (): void => {
      if (inflight.get(ws) === promise) inflight.delete(ws);
    };
    void promise.then(clear, clear);
    return promise;
  };

  const probe = (ws: string): Promise<SandboxHealthState> => dedupe(ws, () => request(ws, null));
  const ensure = (ws: string): Promise<SandboxHealthState> =>
    dedupe(ws, () =>
      request(ws, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: ws }),
      }),
    );

  const markClosed = (code: number, closeReason: string): void => {
    const closedState = healthFromCloseCode(code);
    if (closedState === null) return;
    const trimmed = closeReason.trim();
    state = closedState;
    reason = trimmed !== "" ? trimmed : closedState === "disabled" ? HEALTH_REASONS.closedDisabled : HEALTH_REASONS.closedUnavailable;
    checkedAt = deps.now();
    notify();
  };

  const retry = async (): Promise<SandboxHealthState> => {
    const ws = workspaceId;
    if (ws === null) return state;
    const probed = await probe(ws);
    return probed === "stopped" ? ensure(ws) : probed;
  };

  const subscribe = (listener: (snap: HealthSnapshot) => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { snapshot, subscribe, probe, ensure, markClosed, retry };
}
