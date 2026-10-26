/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   web-dockerfile-closure.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// docker/services/node/Dockerfile.prod COPYs the web build's inputs by name
// (src, packages, config, scripts/vite and a few root files). A file under src/
// that imports something outside those type-checks in the worktree and breaks
// only the CI image build, so this lists every such import and asks for a COPY.
// Caveat: static `from "../…"` and `import("../…")` specifiers with a literal
// path only; an alias (`@/…`) is assumed to stay inside src/, and an import in a
// comment is counted (over-reports, merely noisy).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*)["'](\.\.?\/[^"']+)["']/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "notion-database-sys" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

/** The sources the builder stage COPYs, as paths relative to the app root. */
function copiedSources(): string[] {
  const dockerfile = readFileSync(join(APP_ROOT, "docker/services/node/Dockerfile.prod"), "utf8");
  const builder = dockerfile.split(/^FROM .* AS runtime$/m)[0];
  return [...builder.matchAll(/^COPY (?!--)(.+) \S+$/gm)].flatMap((match) => match[1].split(/\s+/));
}

test("every file src/ imports from outside src/ is copied into the web build image", () => {
  const copied = copiedSources();
  const missing = new Set<string>();
  for (const file of sourceFiles(join(APP_ROOT, "src"))) {
    for (const match of readFileSync(file, "utf8").matchAll(RELATIVE_IMPORT)) {
      const target = relative(APP_ROOT, resolve(dirname(file), match[1]));
      if (target.startsWith("src/")) continue;
      if (!copied.some((source) => target === source || target.startsWith(`${source}/`))) missing.add(target);
    }
  }
  assert.deepEqual([...missing], [], "add a COPY for each to docker/services/node/Dockerfile.prod");
});
