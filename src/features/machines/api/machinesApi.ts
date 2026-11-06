/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machinesApi.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Machines client: one function per session route of scripts/bridge-machines.mjs (the API
// contract in docs/ide/vscode-backend/own-machines-plan.md). It goes through the shared `api`
// client with the page JWT, like patApi and keysApi, so the sudo seam applies: a `sudo_required`
// refusal opens the one SudoPrompt and the person presses the button again.
//
// The bridge is not trusted with the window's address: every `ideOrigin` is re-checked with the
// loopback rule (devil verdict 2026-10-31, condition 6), and a row whose origin fails it reads as
// offline, so nothing can open on it.

import { API_BASE, ApiError, api, getActivePageJwt } from "@/shared/api/client";

import type { IdentityVerdict, MintResult } from "../../ide/vscode/machineLink";
import { isResumeAssertion } from "../../ide/vscode/ideFrameProtocol";
import { isLoopbackIdeOrigin, isMachineId } from "../model/machineShape";

export interface Machine {
  id: string;
  name: string;
  platform: string;
  fingerprint: string;
  isDefault: boolean;
  online: boolean;
  ideOrigin: string | null;
  lastSeenAt: string | null;
}

export interface PairClaim {
  pairId: string;
  name: string;
  platform: string;
  fingerprint: string;
  startIp: string;
  yourIp: string;
}

const MACHINES_PATH = "/api/machines";
const MACHINE_TOKEN = /^osionos_mc1\.[a-z2-7]{8}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const ERROR_COPY: Record<string, string> = {
  not_found: "That machine or code is not there any more. Check the code on the machine, or reload the list.",
  machine_cap: "You have reached the limit of 5 machines. Remove one you no longer use, then try again.",
  offline: "That machine is offline. Start osionos-node on it, then try again.",
  identity_mismatch: "The program on that port is not this machine. Stop it, start osionos-node on the machine, then try again.",
  not_allowed: "This account cannot open that machine.",
  identity_required: "The machine was not checked first. Open it again.",
  rate_limited: "Too many attempts. Wait a while, then try again.",
  sudo_required: "Confirm it is you first, then try again.",
  machines_unavailable: "Machines are unavailable on this server right now.",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** The friendly copy for a bridge error code; an unknown code keeps the bridge's own message. */
export function machineErrorMessage(code: string | undefined, fallback: string): string {
  if (code && ERROR_COPY[code]) return ERROR_COPY[code];
  return fallback.trim() || "That did not go through. Try again.";
}

export function machineFailure(error: unknown): string {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined;
  return machineErrorMessage(code, error instanceof Error ? error.message : "");
}

function parseMachine(value: unknown): Machine | null {
  if (!isRecord(value) || !isMachineId(value.id)) return null;
  const ideOrigin = isLoopbackIdeOrigin(value.ideOrigin) ? value.ideOrigin : null;
  return {
    id: value.id, name: text(value.name), platform: text(value.platform), fingerprint: text(value.fingerprint),
    isDefault: value.isDefault === true, online: value.online === true && ideOrigin !== null, ideOrigin,
    lastSeenAt: typeof value.lastSeenAt === "string" ? value.lastSeenAt : null,
  };
}

// Set from the list reply: the origin the bridge's pairing signatures name (bridge-machines.mjs).
let reportedBridgeOrigin: string | null = null;

function httpsOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value ? value : null;
  } catch {
    return null;
  }
}

export function parseMachineList(body: unknown): Machine[] {
  reportedBridgeOrigin = (isRecord(body) && httpsOrigin(body.bridgeOrigin)) || reportedBridgeOrigin;
  const rows = isRecord(body) && Array.isArray(body.machines) ? body.machines : [];
  return rows.map(parseMachine).filter((machine): machine is Machine => machine !== null);
}

export function parseClaim(body: unknown): PairClaim | null {
  if (!isRecord(body)) return null;
  const fields = ["pairId", "name", "platform", "fingerprint", "startIp", "yourIp"] as const;
  if (!fields.every((field) => typeof body[field] === "string" && body[field] !== "")) return null;
  const [pairId, name, platform, fingerprint, startIp, yourIp] = fields.map((field) => body[field] as string);
  return { pairId, name, platform, fingerprint, startIp, yourIp };
}

export function parseToken(body: unknown): { token: string; exp: number } | null {
  if (!isRecord(body) || typeof body.token !== "string" || !MACHINE_TOKEN.test(body.token)) return null;
  return Number.isSafeInteger(body.exp) ? { token: body.token, exp: body.exp as number } : null;
}

/** The bridge's 60 s resume assertion, or null when the answer is not one. */
export function parseResumeAssertion(body: unknown): string | null {
  return isRecord(body) && isResumeAssertion(body.assertion) ? body.assertion : null;
}

/** The bridge a machine pairs with: the origin it reported, else the one this app calls. */
export function machinesBridgeUrl(): string {
  return reportedBridgeOrigin ?? (API_BASE || globalThis.location.origin).replace(/\/+$/, "");
}

const jwt = (): string | undefined => getActivePageJwt() ?? undefined;
const item = (id: string, action = ""): string => `${MACHINES_PATH}/${encodeURIComponent(id)}${action}`;

export async function listMachines(): Promise<Machine[]> {
  return parseMachineList(await api.get<unknown>(MACHINES_PATH, jwt()));
}

export async function setDefaultMachine(id: string): Promise<void> {
  await api.put<unknown>(item(id, "/default"), {}, jwt());
}

export async function removeMachine(id: string): Promise<void> {
  await api.delete<unknown>(item(id), jwt());
}

export async function claimPairing(code: string): Promise<PairClaim> {
  const claim = parseClaim(await api.post<unknown>(`${MACHINES_PATH}/pair/claim`, { code }, jwt()));
  if (!claim) throw new Error("The server did not describe the machine. Ask the machine for a new code.");
  return claim;
}

export async function approvePairing(pairId: string): Promise<string> {
  const body = await api.post<unknown>(`${MACHINES_PATH}/pair/approve`, { pairId }, jwt());
  return isRecord(body) && isMachineId(body.id) ? body.id : "";
}

export async function declinePairing(pairId: string): Promise<void> {
  await api.post<unknown>(`${MACHINES_PATH}/pair/decline`, { pairId }, jwt());
}

/** The bridge's check that `sig` is the paired machine's key over `nonce` (condition 5). */
export async function verifyMachineIdentity(id: string, nonce: string, sig: string): Promise<IdentityVerdict> {
  try {
    await api.post<unknown>(item(id, "/identity"), { nonce, sig }, jwt());
    return "ok";
  } catch (error) {
    return error instanceof ApiError && error.code === "identity_mismatch" ? "mismatch" : "unavailable";
  }
}

/** A machine token for the IDE window; a step-up refusal is its own result so the view can retry.
 *  The bridge mints once per identity check (428 identity_required otherwise): call it only right
 *  after verifyMachineIdentity answered "ok", which linkMachineFrame guarantees. */
export async function mintMachineToken(id: string, { remember = false }: { remember?: boolean } = {}): Promise<MintResult> {
  try {
    // The bridge signs remember: true into the token only when the body says so (Amendment 1, R6).
    const minted = parseToken(await api.post<unknown>(item(id, "/token"), remember ? { remember: true } : {}, jwt()));
    return minted ? { kind: "ok", token: minted.token } : { kind: "unavailable", reason: "error" };
  } catch (error) {
    if (error instanceof ApiError && error.code === "sudo_required") return { kind: "step-up" };
    return { kind: "unavailable", reason: error instanceof ApiError ? error.code : "error" };
  }
}

/** A remembered computer's second factor (Amendment 1, R2): no step-up, after the same identity
 *  check. Any refusal (a removed machine, an older bridge's 404, no network) is "unavailable", and
 *  the frame link then takes the token path. */
export async function mintResumeAssertion(id: string): Promise<MintResult> {
  try {
    const assertion = parseResumeAssertion(await api.post<unknown>(item(id, "/resume"), {}, jwt()));
    return assertion ? { kind: "resume", assertion } : { kind: "unavailable", reason: "error" };
  } catch (error) {
    return { kind: "unavailable", reason: error instanceof ApiError ? error.code : "error" };
  }
}
