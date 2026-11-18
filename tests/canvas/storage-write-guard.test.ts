/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   storage-write-guard.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/18 00:00:00 by dlesieur         ###   ########.fr       */
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
// The agent-conversations wiring (A5: user content makes room, then is noticed) is checked as
// text, which the component's effect-only writer leaves no other way to reach without a DOM. It
// misses a writer reached through a re-export or a renamed binding (`const write = ...`, an
// `import { noticingWriter as ... }`), and a copy of the expected line left in a comment still
// counts while the live line changes. A brace inside a string literal of `writeThread` can end
// its body early.

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

/** The text opened at `open` (the index of its opening char), `pair` balanced: a call by default. */
function callText(source: string, open: number, pair = "()"): string {
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === pair[0]) depth += 1;
    else if (source[at] === pair[1]) depth -= 1;
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

const AGENT_PAGE = "widgets/agent-conversation/ui/AgentConversationPage.tsx";
const AGENT_WRITER = /\bnoticingWriter\(\s*(['"])Agent conversations\1\s*,\s*setItemEvictingPageCaches\s*\)/g;
const AGENT_WRITER_BINDING = /\bconst\s+writeAgentThreads\s*=\s*noticingWriter\(\s*(['"])Agent conversations\1\s*,\s*setItemEvictingPageCaches\s*\)/;
const WRITE_CALL = /\b(\w*(?:[Ww]rite|setItem)\w*)\s*\(/g;

/** The body of `function name(...)` in `source`, braces balanced; "" when it is not declared. */
function functionBody(source: string, name: string): string {
  const head = new RegExp(`\\bfunction\\s+${name}\\s*\\([^)]*\\)[^{]*\\{`).exec(source);
  return head ? callText(source, head.index + head[0].length - 1, "{}") : "";
}

/** The text of every `useEffect(...)` call in `source`. */
function effectCalls(source: string): string[] {
  return [...source.matchAll(/\buseEffect\s*\(/g)].map((match) => callText(source, (match.index ?? 0) + match[0].length - 1));
}

/** Each write-like call in `body` as "name(firstArgument". */
function writesIn(body: string): string[] {
  return [...body.matchAll(WRITE_CALL)].map((match) => {
    const call = callText(body, (match.index ?? 0) + match[0].length - 1);
    return `${match[1]}(${call.slice(1).split(",")[0].trim()}`;
  });
}

test("the wiring scanner reads a function body, an effect and its writes", () => {
  const source = "function writeThread(a: T) { const t = f({ x: 1 }); writeAgentThreads(KEY, JSON.stringify(t)); }\n"
    + "useEffect(() => { writeThread(pageId, messages); }, [messages, pageId]);";
  assert.deepEqual(writesIn(functionBody(source, "writeThread")), ["writeAgentThreads(KEY"]);
  assert.equal(functionBody(source, "readThread"), "");
  assert.deepEqual(effectCalls(source).map((call) => call.includes("writeThread(pageId, messages)")), [true]);
});

test("A5 agent conversations: one noticing writer that makes room first, labelled for the store", () => {
  const source = read(AGENT_PAGE);
  assert.equal(source.match(AGENT_WRITER)?.length ?? 0, 1, "noticingWriter('Agent conversations', setItemEvictingPageCaches)");
  assert.match(source, AGENT_WRITER_BINDING, "bound to writeAgentThreads");
  assert.match(source, /import\s*\{[^}]*\bnoticingWriter\b[^}]*\}\s*from\s*["']@\/shared\/lib\/storage-full\/noticingWrite["']/);
  assert.match(source, /import\s*\{[^}]*\bsetItemEvictingPageCaches\b[^}]*\}\s*from\s*["']@\/store\/pageStore\.helpers["']/);
});

test("A5 agent conversations: writeThread writes only through writeAgentThreads, under the threads key", () => {
  const source = read(AGENT_PAGE);
  assert.match(source, /\bconst\s+AGENT_THREADS_STORAGE_KEY\s*=\s*["']osionos:agent-conversations["']/);
  const body = functionBody(source, "writeThread");
  assert.notEqual(body, "", "writeThread is declared");
  assert.deepEqual(writesIn(body), ["writeAgentThreads(AGENT_THREADS_STORAGE_KEY"]);
  assert.doesNotMatch(body, /\b(?:local|session)Storage\b/, "no direct storage access");
});

test("A5 agent conversations: an effect writes the thread whenever the messages or the page change", () => {
  const writers = effectCalls(read(AGENT_PAGE)).filter((call) => /\bwriteThread\(\s*pageId\s*,\s*messages\s*\)/.test(call));
  assert.equal(writers.length, 1, "one useEffect calls writeThread(pageId, messages)");
  assert.match(writers[0], /\[\s*(?:messages\s*,\s*pageId|pageId\s*,\s*messages)\s*\]\s*\)$/, "its deps are messages and pageId");
});
