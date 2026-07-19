/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   idePaths.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { IdeTreeNode } from "./ideFileTree";
import { codeBlockOf } from "./codeFile";

/** One code file flattened out of the tree, with its reconstructed path. */
export interface IdeFlatFile {
  path: string;
  content: string;
}

/**
 * Sanitize one path segment (a page title used as a file name). Strips path
 * separators, `..`, NUL and control chars so a title can never escape its
 * folder or forge a path; empty results fall back to "untitled". This is the
 * same guard the container-materialize step (P4) relies on.
 */
export function sanitizeSegment(name: string): string {
  // Control band (NUL..US) mapped per char-code — a raw range in a regex
  // literal trips eslint's no-control-regex; behavior is identical.
  const controlFree = Array.from(name, (ch) => (ch.charCodeAt(0) < 0x20 ? " " : ch)).join("");
  const cleaned = controlFree
    .replace(/[/\\]/g, " ")
    .replace(/\.\.+/g, ".")
    .trim()
    .replace(/\s+/g, " ");
  return cleaned || "untitled";
}

/** Collect every code file under `nodes` as `{ path, content }`, folders implied
 *  by the "/"-joined path of sanitized ancestor titles. Deterministic order. */
export function collectTreeFiles(nodes: IdeTreeNode[], prefix = ""): IdeFlatFile[] {
  const out: IdeFlatFile[] = [];
  for (const node of nodes) {
    const segment = sanitizeSegment(node.page.title || "untitled");
    const path = prefix ? `${prefix}/${segment}` : segment;
    if (node.isFolder) {
      out.push(...collectTreeFiles(node.children, path));
    } else {
      out.push({ path, content: codeBlockOf(node.page)?.content ?? "" });
    }
  }
  return out;
}

/** One create step in an import plan: a folder or a code file, at a path whose
 *  parent segments are guaranteed to appear earlier in the plan. */
export interface ImportEntry {
  kind: "folder" | "code";
  /** Path segments from the import root, sanitized. */
  segments: string[];
  /** File text (code entries only). */
  content?: string;
}

/**
 * Turn a flat list of imported files (each with a "/"-relative path and text)
 * into an ordered create plan: every intermediate folder appears once, before
 * any child, so a consumer can create parents then children in one pass.
 */
export function buildImportPlan(files: { relPath: string; content: string }[]): ImportEntry[] {
  const seenFolders = new Set<string>();
  const plan: ImportEntry[] = [];
  for (const file of files) {
    const raw = file.relPath.split("/").map(sanitizeSegment).filter((s) => s && s !== ".");
    if (raw.length === 0) continue;
    for (let depth = 1; depth < raw.length; depth++) {
      const folderPath = raw.slice(0, depth).join("/");
      if (seenFolders.has(folderPath)) continue;
      seenFolders.add(folderPath);
      plan.push({ kind: "folder", segments: raw.slice(0, depth) });
    }
    plan.push({ kind: "code", segments: raw, content: file.content });
  }
  return plan;
}
