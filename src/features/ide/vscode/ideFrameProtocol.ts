/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideFrameProtocol.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The postMessage contract between the app and the IDE page it frames (devil verdict 2026-10-30,
// C0-F2). The IDE page runs on its own origin with a shell behind it, so this is the only thing
// an app-origin XSS can reach: both directions check the exact origin, and the app may only hand
// over a session token, ask to show a file, or say which known reason it refused the page for. Nothing here types into a terminal, runs a task,
// starts a debugger, installs an extension or writes a setting. Free of `@/` imports so it runs
// under the node canvas runner.
//
// A paired machine adds one round before the token (devil verdict 2026-10-31, condition 5): the
// app sends `hello` with a fresh nonce, the page answers `identity` with its machine id and the
// machine key's signature over it, and the app posts a token only once the bridge has checked
// that signature against the key it paired. A different process on the same loopback port cannot
// produce it.
import { isMachineId } from "../../machines/model/machineShape.ts";

export type RefusalReason = "mismatch" | "unavailable" | "other-account";

export type AppMessage =
  | { type: "osionos-ide/session"; token: string }
  | { type: "osionos-ide/hello"; nonce: string }
  | { type: "osionos-ide/open"; path: string }
  | { type: "osionos-ide/refused"; reason: RefusalReason };

export type IdeState = "connecting" | "connected" | "reconnecting" | "error";

export type IdeMessage =
  | { type: "osionos-ide/ready"; node: string }
  | { type: "osionos-ide/state"; state: IdeState }
  | { type: "osionos-ide/need-session" }
  | { type: "osionos-ide/identity"; machineId: string; sig: string };

// osionos_ide1 is the legacy shared-secret token; osionos_mc1 the bridge-signed machine token
// (`<version>.<kid>.<payload>.<sig>`, scripts/ide-machine-protocol.mjs signMachineToken).
const TOKEN = /^(?:osionos_ide1|osionos_mc1\.[a-z2-7]{8})\.[A-Za-z0-9_-]{1,4000}\.[A-Za-z0-9_-]{1,200}$/;
// 16 to 96 random bytes; the bridge and the node accept 16 to 128 characters.
const NONCE = /^[A-Za-z0-9_-]{22,128}$/;
// An Ed25519 signature is 64 bytes: 86 base64url characters without padding.
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const NODE_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const STATES: ReadonlySet<string> = new Set(["connecting", "connected", "reconnecting", "error"]);
const REFUSALS: ReadonlySet<string> = new Set(["mismatch", "unavailable", "other-account"]);
// eslint-disable-next-line no-control-regex -- refusing control characters is the point
const CONTROL = /[\u0000-\u001f\u007f\\]/;

function shaped(data: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const own = Object.keys(record);
  return own.length === keys.length && own.every((key) => keys.includes(key)) ? record : null;
}

// Relative to the opened folder: no absolute path, no parent, no empty or `.` segment, and no
// dot-name at any depth, which keeps `.git`, `.vscode` (tasks, launch) and `.env` out of reach.
export function isSafeRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024 || CONTROL.test(path)) return false;
  return path.split("/").every((segment) => segment.length > 0 && !segment.startsWith("."));
}

/** 16 random bytes in base64url: the challenge one identity answer must sign. */
export function newNonce(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function readAppMessage(data: unknown, origin: string, appOrigins: readonly string[]): AppMessage | null {
  if (!appOrigins.includes(origin)) return null;
  const type = (data as { type?: unknown } | null)?.type;
  if (type === "osionos-ide/session") {
    const record = shaped(data, ["type", "token"]);
    return record && typeof record.token === "string" && TOKEN.test(record.token) ? { type, token: record.token } : null;
  }
  if (type === "osionos-ide/hello") {
    const record = shaped(data, ["type", "nonce"]);
    return record && typeof record.nonce === "string" && NONCE.test(record.nonce) ? { type, nonce: record.nonce } : null;
  }
  if (type === "osionos-ide/open") {
    const record = shaped(data, ["type", "path"]);
    return record && isSafeRelativePath(record.path) ? { type, path: record.path } : null;
  }
  if (type === "osionos-ide/refused") {
    const record = shaped(data, ["type", "reason"]);
    return record && typeof record.reason === "string" && REFUSALS.has(record.reason) ? { type, reason: record.reason as RefusalReason } : null;
  }
  return null;
}

export function readIdeMessage(data: unknown, origin: string, ideOrigin: string): IdeMessage | null {
  if (origin !== ideOrigin) return null;
  const type = (data as { type?: unknown } | null)?.type;
  if (type === "osionos-ide/ready") {
    const record = shaped(data, ["type", "node"]);
    return record && typeof record.node === "string" && NODE_ID.test(record.node) ? { type, node: record.node } : null;
  }
  if (type === "osionos-ide/state") {
    const record = shaped(data, ["type", "state"]);
    return record && typeof record.state === "string" && STATES.has(record.state) ? { type, state: record.state as IdeState } : null;
  }
  if (type === "osionos-ide/need-session") return shaped(data, ["type"]) ? { type } : null;
  if (type === "osionos-ide/identity") {
    const record = shaped(data, ["type", "machineId", "sig"]);
    if (!record || !isMachineId(record.machineId) || typeof record.sig !== "string" || !SIGNATURE.test(record.sig)) return null;
    return { type, machineId: record.machineId, sig: record.sig };
  }
  return null;
}
