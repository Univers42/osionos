/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspacePath.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { sanitizeSegment } from "./idePaths";

/** Why a workspace-relative path was refused. */
export type WorkspacePathProblem =
  | "empty"
  | "absolute"
  | "empty-segment"
  | "dot-segment"
  | "control-char"
  | "separator"
  | "unsafe-name"
  | "into-self";

function isControl(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
}

/** Typed so the UI can show `message` verbatim and tests can branch on `problem`. */
export class WorkspacePathError extends Error {
  readonly problem: WorkspacePathProblem;
  readonly path: string;

  constructor(problem: WorkspacePathProblem, path: string, detail: string) {
    super(`Invalid path "${[...path].map((ch) => (isControl(ch) ? "?" : ch)).join("")}": ${detail}`);
    this.name = "WorkspacePathError";
    this.problem = problem;
    this.path = path;
  }
}

// Ponytail: only `scheme://` and `C:\` / `C:/` count as absolute besides a leading
// slash; a name like "a:b" is a legal POSIX name and is accepted. Under-rejects
// exotic forms (UNC `\\host`), which the mount table still refuses at resolve().
const ABSOLUTE_RE = /^([/\\]|[a-zA-Z][a-zA-Z0-9+.-]*:\/\/|[a-zA-Z]:[/\\])/;

/** Validate a workspace-relative POSIX path; returns it unchanged. `""` is the
 *  workspace root and only passes with `allowRoot`. */
export function validateRelPath(rel: string, opts: { allowRoot?: boolean } = {}): string {
  if (rel === "") {
    if (opts.allowRoot) return rel;
    throw new WorkspacePathError("empty", rel, "the path is empty. Give a file or folder name.");
  }
  if ([...rel].some(isControl)) {
    throw new WorkspacePathError("control-char", rel, "control characters are not allowed. Remove them.");
  }
  if (ABSOLUTE_RE.test(rel)) {
    throw new WorkspacePathError("absolute", rel, "paths are relative to the workspace folder. Drop the leading slash or scheme.");
  }
  for (const segment of rel.split("/")) {
    if (segment === "") throw new WorkspacePathError("empty-segment", rel, "empty segment (double or trailing slash).");
    if (segment === "." || segment === "..") {
      throw new WorkspacePathError("dot-segment", rel, `"${segment}" segments are not allowed.`);
    }
  }
  return rel;
}

/** A single file or folder name: a valid path with no separator. */
export function validateName(name: string): string {
  validateRelPath(name);
  if (name.includes("/")) throw new WorkspacePathError("separator", name, "a name cannot contain '/'. Create folders one at a time.");
  // The sandbox materializer names files with sanitizeSegment, so a name it would
  // rewrite (edge whitespace, "..", backslash) would not round-trip: refuse it here.
  if (sanitizeSegment(name) !== name) {
    throw new WorkspacePathError("unsafe-name", name, "the name has leading/trailing spaces, repeated spaces, '..' or a backslash. Simplify it.");
  }
  return name;
}

export function joinRel(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

export function parentOf(rel: string): string {
  const cut = rel.lastIndexOf("/");
  return cut < 0 ? "" : rel.slice(0, cut);
}

export function baseName(rel: string): string {
  return rel.slice(rel.lastIndexOf("/") + 1);
}
