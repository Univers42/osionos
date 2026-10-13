/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lucideIconChunks.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Build-time chunk placement for lucide icons (vite.config.ts manualChunks).
//
// lucide-react/dynamicIconImports turns every icon (~1600) into a dynamic entry; left alone
// Rollup emits one chunk per icon and the build crawls, so they are hashed into 32 buckets.
// But an icon the app ALSO imports by name (`import { Plus } from "lucide-react"`) then pulls
// its whole ~50-icon bucket into the chunk that imports it: measured 2026-10-13 on the served
// build, the entry statically imported all 32 buckets (~0.95 MB of JS) for the icons it uses
// by name. Those icons go to ONE `vendor-lucide-static` chunk instead; the buckets keep only
// icons reached through dynamicIconImports (page icons, the icon picker).
//
// Ponytail: "imported by name" is read from each module's top-level import/export statements
// (Rollup's AST). An icon reached another way - `import * as L from "lucide-react"`, or a
// computed lookup on the barrel - is not seen and stays in its bucket: today's behaviour, so the
// failure is a smaller win, never a missing icon.

import type { Plugin } from "vite";

interface AstNode {
  type: string;
  [key: string]: unknown;
}

const LUCIDE_SOURCE = "lucide-react";
const ICON_FILE = /[/\\]lucide-react[/\\]dist[/\\]esm[/\\]icons[/\\]([^/\\]+)\.js$/;
const BARREL_FILE = /[/\\]lucide-react[/\\]dist[/\\]esm[/\\]lucide-react\.js$/;
const ICON_BUCKETS = 32;
export const STATIC_ICON_CHUNK = "vendor-lucide-static";

function nameOf(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const { name, value } = node as { name?: unknown; value?: unknown };
  if (typeof name === "string") return name;
  return typeof value === "string" ? value : null;
}

function sourceOf(statement: AstNode): string | null {
  return nameOf(statement.source);
}

function specifiersOf(statement: AstNode): AstNode[] {
  return Array.isArray(statement.specifiers) ? (statement.specifiers as AstNode[]) : [];
}

/** Names a module imports or re-exports from "lucide-react" at top level. O(statements). */
export function lucideNamesUsedBy(body: readonly AstNode[]): string[] {
  const names: string[] = [];
  for (const statement of body) {
    if (sourceOf(statement) !== LUCIDE_SOURCE) continue;
    for (const specifier of specifiersOf(statement)) {
      const name = statement.type === "ImportDeclaration" ? nameOf(specifier.imported) : nameOf(specifier.local);
      if (name) names.push(name);
    }
  }
  return names;
}

/** The barrel's export name -> icon file stem ("ChevronRight" -> "chevron-right"). O(statements). */
export function lucideBarrelIcons(body: readonly AstNode[]): Map<string, string> {
  const icons = new Map<string, string>();
  for (const statement of body) {
    const stem = /^\.\/icons\/([^/]+)\.js$/.exec(sourceOf(statement) ?? "")?.[1];
    if (statement.type !== "ExportNamedDeclaration" || !stem) continue;
    for (const specifier of specifiersOf(statement)) {
      const name = nameOf(specifier.exported);
      if (name) icons.set(name, stem);
    }
  }
  return icons;
}

function bucketOf(stem: string): string {
  let hash = 0;
  for (let index = 0; index < stem.length; index += 1) hash = (hash * 31 + stem.charCodeAt(index)) | 0;
  return `vendor-lucide-${((hash % ICON_BUCKETS) + ICON_BUCKETS) % ICON_BUCKETS}`;
}

/**
 * The plugin records lucide names as Rollup parses each module; `chunkOf` (called from
 * manualChunks, after every module was parsed) places an icon file: static chunk when some
 * module imports it by name, else its hash bucket; undefined for anything that is not an icon.
 */
export function lucideIconChunks(): { plugin: Plugin; chunkOf: (id: string) => string | undefined } {
  const usedNames = new Set<string>();
  let barrel = new Map<string, string>();
  let staticStems: Set<string> | null = null;
  const plugin: Plugin = {
    name: "osionos-lucide-icon-chunks",
    apply: "build",
    buildStart() {
      usedNames.clear();
      staticStems = null;
    },
    moduleParsed(info) {
      const body = (info.ast as { body?: AstNode[] } | null)?.body ?? [];
      if (BARREL_FILE.test(info.id)) barrel = lucideBarrelIcons(body);
      else for (const name of lucideNamesUsedBy(body)) usedNames.add(name);
    },
  };
  const chunkOf = (id: string): string | undefined => {
    const stem = ICON_FILE.exec(id)?.[1];
    if (!stem) return undefined;
    staticStems ??= new Set([...usedNames].flatMap((name) => barrel.get(name) ?? []));
    return staticStems.has(stem) ? STATIC_ICON_CHUNK : bucketOf(stem);
  };
  return { plugin, chunkOf };
}
