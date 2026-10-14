/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   debugGutter.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const URI_PREFIX = "file:///workspace/";

export interface GutterFrame {
  path: string | null;
  line: number;
}

export interface GutterState {
  breakpoints: Record<string, number[]>;
  status: string;
  frames: GutterFrame[];
}

export interface GutterMark {
  line: number;
  kind: "breakpoint" | "current";
}

/** Workspace-relative path of a Monaco model URI, or null outside the
 *  workspace. O(m) in the URI length. */
export function workspacePathOfUri(uri: string): string | null {
  if (!uri.startsWith(URI_PREFIX)) return null;
  const rest = uri.slice(URI_PREFIX.length);
  if (rest === "") return null;
  // A `..` segment would escape the workspace root, so it is not a path here.
  for (const segment of rest.split("/")) {
    if (segment === "..") return null;
  }
  return rest;
}

/** True for Python source files, by extension. O(1). */
export function isPythonPath(path: string): boolean {
  return path.endsWith(".py");
}

/** Gutter marks for one file: one `breakpoint` per stored line, plus a
 *  `current` mark on the top frame when stopped in this file. O(b) in this
 *  file's breakpoint lines. */
export function gutterMarks(path: string, state: GutterState): GutterMark[] {
  // Own keys only: an inherited name such as "toString" holds no lines.
  const lines = Object.hasOwn(state.breakpoints, path) ? state.breakpoints[path] : [];
  const marks: GutterMark[] = lines.map((line) => ({ line, kind: "breakpoint" as const }));
  if (state.status === "stopped") {
    const top = state.frames[0];
    if (top !== undefined && top.path === path) marks.push({ line: top.line, kind: "current" });
  }
  return marks;
}
