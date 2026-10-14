/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mermaid-security-level.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Mermaid diagrams come from shared pages. Any `securityLevel` but "strict" runs their
// `click … call` callbacks and HTML labels in the app origin (devil C17, 2026-10-14), and
// the nested notion-database-sys preview shipped "loose" while the app's own was strict.
// Ponytail: a text scan — it reads only `initialize(` calls in files that import mermaid
// and an inline `securityLevel` literal; a config object built in another file and passed
// by name is counted as a call without "strict", so it fails loudly rather than passing.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const SKIP = new Set(["node_modules", "dist", "build", ".git", "coverage"]);
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;

/** Every source file under `dir`, depth-first. O(files). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (SOURCE.test(entry.name)) out.push(path);
  }
  return out;
}

test("every mermaid.initialize in src/ and packages/ uses securityLevel strict", () => {
  const sites: string[] = [];
  for (const file of [...sourceFiles("src"), ...sourceFiles("packages")]) {
    const text = readFileSync(file, "utf8");
    if (!/["']mermaid["']/.test(text)) continue;
    const calls = text.match(/\.initialize\s*\(/g)?.length ?? 0;
    if (calls === 0) continue;
    sites.push(file);
    const levels = [...text.matchAll(/securityLevel\s*:\s*["'`]?([\w-]+)/g)].map((m) => m[1]);
    assert.ok(levels.every((level) => level === "strict"), `${file}: securityLevel ${levels.join(",")}`);
    assert.ok(levels.length >= calls, `${file}: ${String(calls)} initialize call(s), ${String(levels.length)} strict literal(s)`);
  }
  // The two known renderers; fewer means the scan stopped seeing them.
  assert.ok(sites.length >= 2, `found only: ${sites.join(", ")}`);
});
