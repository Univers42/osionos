/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vpath.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { fsError } from "./errors";

/** Opaque path (ADR-001 §1). Constructed ONCE at the boundary; no consumer
 *  above the provider line ever string-joins with "/" or "\". Presentation is
 *  POSIX-style everywhere; provider differences live in capabilities. */
export type VPath = {
  /** Canonical URI, e.g. "sandbox://<ws>/workspace/src/main.c". */
  readonly uri: string;
  readonly scheme: string;
  readonly authority: string;
  /** Normalized segments — ""/"."/".." resolved (never escaping the mount
   *  root), original characters preserved (a "\" is a legal POSIX name char). */
  readonly segments: readonly string[];
  /** NFC-normalized comparison key: equality/collision checks only — never
   *  round-tripped to a provider (macOS NFD names compare equal, keep bytes). */
  readonly compareKey: string;
};

const SCHEME_AUTHORITY_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)$/;

function assertSegment(name: string, uri: string): void {
  if (!name || name === "." || name === "..") throw fsError("Unsupported", uri, "invalid path segment");
  if (name.includes("/") || name.includes("\0")) throw fsError("PermissionDenied", uri, "invalid segment character");
}

/** Trusted builder used by providers and joinV — segments must be plain names. */
export function buildVPath(scheme: string, authority: string, segments: readonly string[]): VPath {
  const lowered = scheme.toLowerCase();
  const uri = `${lowered}://${authority}/${segments.map((s) => encodeURIComponent(s)).join("/")}`;
  for (const segment of segments) assertSegment(segment, uri);
  return {
    uri,
    scheme: lowered,
    authority,
    segments: [...segments],
    compareKey: segments.map((s) => s.normalize("NFC")).join("/"),
  };
}

/** Parse + normalize a VFS URI. Percent-decoding, "."/"" collapse and ".."
 *  resolution happen HERE, exactly once; a ".." that would climb above the
 *  mount root is refused, never clamped. */
export function parseVPath(uri: string): VPath {
  const match = SCHEME_AUTHORITY_RE.exec(uri);
  if (!match) throw fsError("Unsupported", uri, "not a vfs uri");
  const [, scheme, rawAuthority, rawPath] = match;
  const resolved: string[] = [];
  for (const raw of rawPath.split("/")) {
    if (!raw || raw === ".") continue;
    const segment = decodeURIComponent(raw);
    if (segment === "..") {
      if (resolved.length === 0) throw fsError("PermissionDenied", uri, "path escapes the mount root");
      resolved.pop();
      continue;
    }
    if (segment.includes("/") || segment.includes("\0")) {
      throw fsError("PermissionDenied", uri, "invalid segment character");
    }
    resolved.push(segment);
  }
  return buildVPath(scheme, decodeURIComponent(rawAuthority), resolved);
}

/** Append single NAMES (never paths) to a base — the only sanctioned "join". */
export function joinV(base: VPath, ...names: string[]): VPath {
  return buildVPath(base.scheme, base.authority, [...base.segments, ...names]);
}

/** Parent path, or null at the mount root. */
export function parentV(path: VPath): VPath | null {
  return path.segments.length === 0 ? null : buildVPath(path.scheme, path.authority, path.segments.slice(0, -1));
}

/** Final segment, or null at the mount root. */
export function basenameV(path: VPath): string | null {
  return path.segments.length === 0 ? null : path.segments[path.segments.length - 1];
}

/** Same file identity (scheme + authority + NFC compare key). */
export function samePath(a: VPath, b: VPath): boolean {
  return a.scheme === b.scheme && a.authority === b.authority && a.compareKey === b.compareKey;
}
