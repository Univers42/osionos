/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   storage-write-guard.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0056 A5 guard: a write to localStorage that a full origin can refuse goes through
// src/shared/lib/storage-full/noticingWrite.ts, so the refusal never throws and is shown.
// Caveat: a regex scan, so it under-reports. It misses a setItem reached through an alias or
// a helper (`storage.setItem`, `storage().setItem`), a zustand persist imported under another
// name, and a `storage:` option that names a storage not built on noticingWrite (it checks
// the option is present and the file imports noticingWrite, not where the option leads). A
// paren inside a string literal of a persist call can end the call early. Escape hatch for a
// write that must stay bare: an ALLOWED_BARE_WRITES entry with its reason.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const SRC = new URL("../../src/", import.meta.url);
const SUBMODULE = "shared/notion-database-sys/";
const NOTICING_IMPORT = /from\s*["'][^"']*storage-full\/noticingWrite["']/;
const ZUSTAND_PERSIST_IMPORT = /import\s*\{[^}]*\bpersist\b[^}]*\}\s*from\s*["']zustand\/middleware["']/;
const BARE_WRITE = /\blocalStorage\??\.setItem\(/g;

/** Every bare write left on purpose, by file, with how many and why. */
const ALLOWED_BARE_WRITES: Record<string, { count: number; reason: string }> = {
  "store/pageStore.helpers.ts": {
    count: 2,
    reason: "the workspace page caches themselves: rebuilt from the server, the eviction candidates",
  },
  "shared/config/themeApply.ts": {
    count: 1,
    reason: "a pre-boot paint mirror of the Theme store, which is noticed; caught and rebuilt on boot",
  },
  "shared/lib/perf/collabLatencyMarks.ts": {
    count: 1,
    reason: "a doc comment telling a developer how to switch the timing marks on",
  },
  "editor-client/ExplorerView.tsx": {
    count: 2,
    reason: "the editor-client entry mounts no toast viewport; a refused write is caught and resets",
  },
  "editor-client/fileKeys.ts": {
    count: 1,
    reason: "tab keys for open files, kept in memory for this load; caught, rebuilt on the next click",
  },
  "features/legacy-second-brain/sync/graphSnapshot.ts": {
    count: 1,
    reason: "a cache of the last graph read, refetched from the server; caught",
  },
};

/** Source files under src/, the database submodule and tests excluded, relative to src/. */
function sourceFiles(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .map((path) => path.split("\\").join("/"))
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    .filter((path) => !path.startsWith(SUBMODULE));
}

/** The text of the call opened at `open` (the index of its "("), parens balanced. */
function callText(source: string, open: number): string {
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === "(") depth += 1;
    else if (source[at] === ")") depth -= 1;
    if (depth === 0) return source.slice(open, at + 1);
  }
  return source.slice(open);
}

/** How many zustand persist calls in `source` reach no noticing storage. */
function persistCallsWithoutNoticing(source: string): number {
  if (!ZUSTAND_PERSIST_IMPORT.test(source)) return 0;
  const imported = NOTICING_IMPORT.test(source);
  let missing = 0;
  for (const match of source.matchAll(/(?<![.\w])persist\s*(?:<[^>]*>)?\s*\(/g)) {
    const call = callText(source, (match.index ?? 0) + match[0].length - 1);
    if (!imported || !/\bstorage\s*:/.test(call)) missing += 1;
  }
  return missing;
}

function read(path: string): string {
  return readFileSync(new URL(path, SRC), "utf8");
}

test("the scanner sees a persist call with no storage and ignores one that has it", () => {
  const head = 'import { persist } from "zustand/middleware";\n';
  const noticing = 'import { noticingJsonStorage } from "@/shared/lib/storage-full/noticingWrite";\n';
  const bare = "create(persist((set) => ({ a: f(1) }), { name: 'k', partialize: (s) => ({ a: s.a }) }));";
  const wired = "create(persist((set) => ({}), { name: 'k', storage: noticingJsonStorage('X') }));";
  assert.equal(persistCallsWithoutNoticing(head + bare), 1);
  assert.equal(persistCallsWithoutNoticing(head + noticing + bare), 1, "noticingWrite imported, no storage");
  assert.equal(persistCallsWithoutNoticing(head + noticing + wired), 0);
  assert.equal(persistCallsWithoutNoticing(head + wired), 1, "a storage not from noticingWrite");
  assert.equal(persistCallsWithoutNoticing(bare), 0, "a persist that is not zustand's");
});

test("every zustand persist store writes through noticingWrite", () => {
  const offenders = sourceFiles()
    .map((path) => ({ path, missing: persistCallsWithoutNoticing(read(path)) }))
    .filter(({ missing }) => missing > 0)
    .map(({ path, missing }) => `${path} (${missing})`);
  assert.deepEqual(offenders, [], "persist() without a noticingWrite storage");
});

test("no bare localStorage.setItem outside the allowlist, and the allowlist is not stale", () => {
  const found = new Map<string, number>();
  for (const path of sourceFiles()) {
    const count = read(path).match(BARE_WRITE)?.length ?? 0;
    if (count > 0) found.set(path, count);
  }
  const unexpected = [...found].filter(([path, count]) => ALLOWED_BARE_WRITES[path]?.count !== count);
  const stale = Object.keys(ALLOWED_BARE_WRITES).filter((path) => !found.has(path));
  assert.deepEqual(unexpected.map(([path, count]) => `${path} (${count})`), []);
  assert.deepEqual(stale, [], "allowlist entries that no longer match");
});
