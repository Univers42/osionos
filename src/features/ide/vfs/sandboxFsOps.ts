/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sandboxFsOps.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { fsError, type FsErrorCode } from "./errors";
import type { ListedEntry } from "./types";

/** The wire shape both transports return: the raw exec result the bridge
 *  relays. Parsing + taxonomy mapping happen HERE, unit-tested, never server-side. */
export type FsOpResult = { exitCode: number | null; output: string };
export type FsOpName = "read" | "list" | "stat" | "mkdir" | "delete" | "rename" | "write";
export type FsOpParams = {
  path: string;
  to?: string;
  offset?: number;
  length?: number;
  recursive?: boolean;
  overwrite?: boolean;
  contentBase64?: string;
};
export type FsOpTransport = (op: FsOpName, params: FsOpParams) => Promise<FsOpResult>;

const TAG_TO_CODE: Record<string, FsErrorCode> = {
  ENOENT: "NotFound",
  ENOPARENT: "NotFound",
  EEXIST: "AlreadyExists",
  ENOTEMPTY: "NotEmpty",
  ENOTDIR: "NotADirectory",
  EISDIR: "IsADirectory",
  E2BIG: "TooLarge",
  EIO: "Io",
};

/** The TTY adds CRs; every parser strips them once, here. */
function clean(output: string): string {
  return output.replace(/\r/g, "");
}

/** Throw the taxonomy error a failed op result encodes; return cleaned stdout
 *  on success. An untagged failure is an honest Io, never a guess. */
export function outputOrThrow(result: FsOpResult, uri: string): string {
  const output = clean(result.output);
  if (result.exitCode === 0) return output;
  const tag = /VFSERR:([A-Z0-9]+)/.exec(output)?.[1];
  throw fsError(tag ? TAG_TO_CODE[tag] ?? "Io" : "Io", uri, tag ?? `exec exit ${String(result.exitCode)}`);
}

/** `ls -1A -p` output → entries (trailing "/" marks a directory). */
export function parseListOutput(output: string): ListedEntry[] {
  const entries: ListedEntry[] = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    const isDir = line.endsWith("/");
    entries.push({ name: isDir ? line.slice(0, -1) : line, kind: isDir ? "dir" : "file" });
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** `kind|sizeBytes|mtimeSec` → stat fields. */
export function parseStatOutput(output: string, uri: string): { kind: "file" | "dir"; sizeBytes: number; mtimeMs: number | null } {
  const [kind, size, mtime] = output.trim().split("|");
  if (kind !== "file" && kind !== "dir") throw fsError("Io", uri, `unparseable stat: ${output.slice(0, 40)}`);
  const mtimeSec = Number(mtime);
  return {
    kind,
    sizeBytes: Number(size) || 0,
    mtimeMs: Number.isFinite(mtimeSec) && mtimeSec > 0 ? mtimeSec * 1000 : null,
  };
}

/** Base64 codec over bytes (browser atob/btoa are Latin-1; chunk to stay under
 *  argument limits). Node ≥ 16 ships both globals, so the same code unit-tests. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
