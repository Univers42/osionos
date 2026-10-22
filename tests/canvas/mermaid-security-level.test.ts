/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mermaid-security-level.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Mermaid diagrams come from shared pages. Any `securityLevel` but "strict" runs their
// `click … call` callbacks and HTML labels in the app origin (devil C17, 2026-10-14), and
// the nested notion-database-sys preview shipped "loose" while the app's own was strict.
// Devil C108 (2026-10-22): "strict" alone is not a sandbox — strict still lets DOMPurify
// keep an <img> inside a label, so every viewer's browser fetches a third-party URL, and a
// `%%{init:…}%%` directive rewrites the config per diagram. The app therefore renders
// through the LOCKED renderer of @osionos/ui (`lockedMermaidConfig`), and the kit's own
// preview keeps an inline strict literal until its slice lands.
// Ponytail: a text scan — it reads the argument of each `initialize(` call; a config
// object built in another file and passed by name is counted as a call without "strict",
// so it fails loudly rather than passing.

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

/** The argument of every `.initialize(` call, the parens balanced. */
function initializeArgs(text: string): string[] {
  const args: string[] = [];
  const call = /\.initialize\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = call.exec(text)) !== null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < text.length && depth > 0) {
      const char = text[i];
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      i += 1;
    }
    args.push(depth === 0 ? text.slice(start, i - 1) : text.slice(start));
  }
  return args;
}

test("every mermaid.initialize in src/ and packages/ is locked", () => {
  const sites: string[] = [];
  for (const file of [...sourceFiles("src"), ...sourceFiles("packages")]) {
    const text = readFileSync(file, "utf8");
    if (!/["']mermaid["']/.test(text)) continue;
    const args = initializeArgs(text);
    if (args.length === 0) continue;
    sites.push(file);
    const levels = [...text.matchAll(/securityLevel\s*:\s*["'`]?([\w-]+)/g)].map((m) => m[1]);
    assert.ok(levels.every((level) => level === "strict"), `${file}: securityLevel ${levels.join(",")}`);
    for (const arg of args) {
      const locked = /lockedMermaidConfig\s*\(/.test(arg);
      const strict = /securityLevel\s*:\s*["'`]strict["'`]/.test(arg);
      assert.ok(
        locked || strict,
        `${file}: initialize() without lockedMermaidConfig() nor an inline strict literal`,
      );
    }
  }
  // The two known renderers; fewer means the scan stopped seeing them.
  assert.ok(sites.length >= 2, `found only: ${sites.join(", ")}`);
});
