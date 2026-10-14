/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vfs-conformance.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ONE corpus, EVERY provider (ADR-001): the artifact that converts "connects to
// any filesystem" into something a machine checks. A future backend (sandbox,
// host file://, sftp) ships by passing THIS suite unchanged.

import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The bridge's REAL spec builders (.mjs) — the sandbox target below executes
// them through a real local sh, so the exact scripts a live sandbox runs are
// conformance-proven without a running stack.
import { buildFsOpSpec, buildWriteSpecs } from "../../scripts/ide-sandbox-spec.mjs";
import { createHostFsTransport } from "../../scripts/host-fs-ops.mjs";
import { createSandboxProvider } from "../../src/features/ide/vfs/sandboxProvider.ts";
import { sandboxHashes, type FsOpResult, type FsOpTransport } from "../../src/features/ide/vfs/sandboxFsOps.ts";
import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { parseVPath, joinV, buildVPath } from "../../src/features/ide/vfs/vpath.ts";
import { isFsError } from "../../src/features/ide/vfs/errors.ts";
import { collectBytes, textToBytes, bytesToText } from "../../src/features/ide/vfs/bytes.ts";
import { createMemProvider } from "../../src/features/ide/vfs/memProvider.ts";
import { createOverlayProvider } from "../../src/features/ide/vfs/overlayProvider.ts";
import { createPageProvider, type PageFacade, type PageFacadeEntry } from "../../src/features/ide/vfs/pageProvider.ts";
import { createPageFileFacade } from "../../src/features/page-file/model/pageFileFacade.ts";
import { createFixtureStore } from "./page-file-facade-fixtures.ts";
import { createMountTable } from "../../src/features/ide/vfs/mountTable.ts";
import { sanitizeSegment } from "../../src/features/ide/model/idePaths.ts";
import type { FsProvider } from "../../src/features/ide/vfs/types.ts";

function memFacade(): PageFacade {
  const pages = new Map<string, PageFacadeEntry & { archived: boolean; content: string }>();
  let nextId = 1;
  const sizeOf = (content: string) => new TextEncoder().encode(content).length;
  return {
    list: () => [...pages.values()].filter((p) => !p.archived),
    async readContent(id) {
      return pages.get(id)?.content ?? "";
    },
    async create(input) {
      const content = input.content ?? "";
      const entry = {
        id: `p${nextId++}`, title: input.title, parentId: input.parentId, kind: input.kind,
        content, sizeBytes: sizeOf(content), mtimeMs: Date.now(), archived: false,
      };
      pages.set(entry.id, entry);
      return entry;
    },
    async writeContent(id, content) {
      const page = pages.get(id);
      if (page) { page.content = content; page.sizeBytes = sizeOf(content); page.mtimeMs = Date.now(); }
    },
    async rename(id, title) {
      const page = pages.get(id);
      if (page) page.title = title;
    },
    async move(id, parentId) {
      const page = pages.get(id);
      if (page) page.parentId = parentId;
    },
    async archive(id) {
      const archiveTree = (target: string): void => {
        const page = pages.get(target);
        if (page) page.archived = true;
        for (const child of pages.values()) if (child.parentId === target) archiveTree(child.id);
      };
      archiveTree(id);
    },
    toSegment: sanitizeSegment,
  };
}

/** Execute a built exec spec via the local sh — same argv a live sandbox runs. */
/** overPty runs each script under script(1), a real terminal: the bridge execs every fs op
 *  with Tty:true, and a terminal changes what tools print (GNU ls shell-quotes
 *  `with space.txt` on a tty, so the explorer showed the quotes and the open said ENOENT). */
function localShTransport(cwd: string, overPty = false): FsOpTransport {
  return (op, params) =>
    new Promise((resolve) => {
      let specs: { Cmd: string[] }[];
      try {
        specs = (op === "write" ? buildWriteSpecs(params.path, params.contentBase64) : [buildFsOpSpec(op, params)]) as { Cmd: string[] }[];
      } catch (error) {
        resolve({ exitCode: 1, output: `VFSERR:${(error as Error).message}` });
        return;
      }
      const runOne = (spec: { Cmd: string[] }) => new Promise<FsOpResult>((done) => {
        const quoted = spec.Cmd.map((arg) => `'${arg.replace(/'/g, "'\\''")}'`).join(" ");
        const [cmd, ...args] = overPty ? ["script", "-qec", quoted, "/dev/null"] : spec.Cmd;
        execFile(cmd, args, { cwd, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
          done({ exitCode: error ? (typeof error.code === "number" ? error.code : 1) : 0, output: String(stdout) });
        });
      });
      void (async () => {
        let result: FsOpResult = { exitCode: 0, output: "" };
        for (const spec of specs) if ((result = await runOne(spec)).exitCode !== 0) break;
        resolve(result);
      })();
    });
}

function hasSh(cmd = "sh", args = ["-c", "exit 0"]): boolean {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const TARGETS: { name: string; make: () => FsProvider }[] = [
  { name: "host(node)", make: () => createSandboxProvider("host", createHostFsTransport(mkdtempSync(join(tmpdir(), "vfs-host-")))) },
  { name: "mem", make: () => createMemProvider("mem") },
  { name: "overlay(mem,mem)", make: () => createOverlayProvider("overlay", createMemProvider("mem"), createMemProvider("mem")) },
  { name: "page-backed", make: () => createPageProvider("osionos", memFacade()) },
  { name: "page-file", make: () => createPageProvider("workspace", createPageFileFacade(createFixtureStore("ws"))) },
  ...(hasSh()
    ? [{ name: "sandbox(sh)", make: () => createSandboxProvider("sandbox", localShTransport(mkdtempSync(join(tmpdir(), "vfs-")))) }]
    : []),
  ...(hasSh("script", ["-qec", "exit 0", "/dev/null"])
    ? [{ name: "sandbox(sh on a tty)", make: () => createSandboxProvider("sandbox", localShTransport(mkdtempSync(join(tmpdir(), "vfs-")), true)) }]
    : []),
];

const root = (p: FsProvider) => buildVPath(p.scheme, "t", []);
const at = (p: FsProvider, ...names: string[]) => joinV(root(p), ...names);
const writeText = (p: FsProvider, path: ReturnType<typeof at>, text: string, opts?: { create?: boolean; overwrite?: boolean }) =>
  p.write(path, textToBytes(text), opts);
const readText = async (p: FsProvider, path: ReturnType<typeof at>) => bytesToText(await collectBytes(await p.read(path)));
const codeOf = (error: unknown) => (isFsError(error) ? error.code : `not-an-FsError: ${String(error)}`);

for (const target of TARGETS) {
  test(`vfs[${target.name}] write/read round-trip, unicode content, zero-byte`, async () => {
    const p = target.make();
    await writeText(p, at(p, "a.txt"), "hello vfs");
    assert.equal(await readText(p, at(p, "a.txt")), "hello vfs");
    await writeText(p, at(p, "u.txt"), "emoji 🚀 + RTL שלום + accents éé");
    assert.equal(await readText(p, at(p, "u.txt")), "emoji 🚀 + RTL שלום + accents éé");
    await writeText(p, at(p, "empty"), "");
    assert.equal(await readText(p, at(p, "empty")), "");
    assert.equal((await p.stat(at(p, "empty"))).sizeBytes, 0);
  });

  test(`vfs[${target.name}] ranged read never materializes the whole file`, async () => {
    const p = target.make();
    await writeText(p, at(p, "r.txt"), "0123456789");
    const slice = bytesToText(await collectBytes(await p.read(at(p, "r.txt"), { offset: 2, length: 3 })));
    assert.equal(slice, "234");
  });

  test(`vfs[${target.name}] a 400 KB source file saves and reads back whole`, async () => {
    const p = target.make();
    const big = Array.from({ length: 8000 }, (_, i) => `int f${i}(void) { return ${i}; } /* pad */`).join("\n");
    assert.ok(big.length > 300_000);
    await writeText(p, at(p, "big.c"), big);
    assert.equal(await readText(p, at(p, "big.c")), big);
  });

  test(`vfs[${target.name}] error taxonomy: NotFound / AlreadyExists / create:false`, async () => {
    const p = target.make();
    await assert.rejects(p.read(at(p, "ghost")), (e: unknown) => codeOf(e) === "NotFound");
    await assert.rejects(p.stat(at(p, "ghost")), (e: unknown) => codeOf(e) === "NotFound");
    await writeText(p, at(p, "once.txt"), "v1");
    await assert.rejects(writeText(p, at(p, "once.txt"), "v2", { overwrite: false }), (e: unknown) => codeOf(e) === "AlreadyExists");
    await assert.rejects(writeText(p, at(p, "never.txt"), "x", { create: false }), (e: unknown) => codeOf(e) === "NotFound");
    assert.equal(await readText(p, at(p, "once.txt")), "v1");
  });

  test(`vfs[${target.name}] mkdir/list/delete: NotEmpty then recursive`, async () => {
    const p = target.make();
    await p.mkdir(at(p, "dir"));
    await assert.rejects(p.mkdir(at(p, "dir")), (e: unknown) => codeOf(e) === "AlreadyExists");
    await writeText(p, at(p, "dir", "b.txt"), "b");
    await writeText(p, at(p, "dir", "a.txt"), "a");
    const names = (await p.list(at(p, "dir"))).map((entry) => entry.name);
    assert.deepEqual(names, ["a.txt", "b.txt"]);
    await assert.rejects(p.delete(at(p, "dir")), (e: unknown) => codeOf(e) === "NotEmpty");
    await p.delete(at(p, "dir"), { recursive: true });
    await assert.rejects(p.list(at(p, "dir")), (e: unknown) => codeOf(e) === "NotFound");
    await assert.rejects(p.delete(at(p, "dir")), (e: unknown) => codeOf(e) === "NotFound");
  });

  test(`vfs[${target.name}] rename: move, no-overwrite guard, file-onto-file replace`, async () => {
    const p = target.make();
    await writeText(p, at(p, "src.txt"), "payload");
    await p.mkdir(at(p, "sub"));
    await p.rename(at(p, "src.txt"), at(p, "sub", "dst.txt"));
    await assert.rejects(p.read(at(p, "src.txt")), (e: unknown) => codeOf(e) === "NotFound");
    assert.equal(await readText(p, at(p, "sub", "dst.txt")), "payload");
    await writeText(p, at(p, "blocker.txt"), "old");
    await assert.rejects(
      p.rename(at(p, "sub", "dst.txt"), at(p, "blocker.txt")),
      (e: unknown) => codeOf(e) === "AlreadyExists",
    );
    await p.rename(at(p, "sub", "dst.txt"), at(p, "blocker.txt"), { overwrite: true });
    assert.equal(await readText(p, at(p, "blocker.txt")), "payload");
  });

  test(`vfs[${target.name}] deep tree (20 levels) + 50-entry directory`, async () => {
    const p = target.make();
    const deep: string[] = [];
    for (let i = 0; i < 20; i++) {
      deep.push(`d${i}`);
      await p.mkdir(joinV(root(p), ...deep));
    }
    await writeText(p, joinV(root(p), ...deep, "leaf.txt"), "deep");
    assert.equal(await readText(p, joinV(root(p), ...deep, "leaf.txt")), "deep");
    await p.mkdir(at(p, "wide"));
    for (let i = 0; i < 50; i++) await writeText(p, at(p, "wide", `f${String(i).padStart(2, "0")}`), String(i));
    assert.equal((await p.list(at(p, "wide"))).length, 50);
  });

  test(`vfs[${target.name}] concurrent writers: consistent, uncorrupted result`, async () => {
    const p = target.make();
    const candidates = Array.from({ length: 10 }, (_, i) => `writer-${i}-${"x".repeat(i)}`);
    await Promise.all(candidates.map((text) => writeText(p, at(p, "hot.txt"), text)));
    const final = await readText(p, at(p, "hot.txt"));
    assert.ok(candidates.includes(final), `got "${final}"`);
  });

  test(`vfs[${target.name}] nasty names: round-trip exactly or refuse honestly`, async () => {
    const p = target.make();
    const nasty = ["with space.txt", "quote'\".txt", "🚀 rocket.md", "עברית.txt", "line\nbreak.txt", "dot.end."];
    for (const name of nasty) {
      try {
        await writeText(p, at(p, name), `content of ${name}`);
      } catch (error) {
        assert.ok(
          isFsError(error) && (error.code === "Unsupported" || error.code === "PermissionDenied"),
          `${name}: silent mangling is forbidden — got ${String(error)}`,
        );
        continue;
      }
      assert.equal(await readText(p, at(p, name)), `content of ${name}`);
      const listed = (await p.list(root(p))).filter((entry) => entry.name === name);
      assert.equal(listed.length, 1, `${name} must list back exactly once`);
    }
  });

  test(`vfs[${target.name}] case-only siblings honor the declared capability`, async () => {
    const p = target.make();
    if (p.capabilities().caseSensitivity !== "sensitive") {
      await writeText(p, at(p, "Case.txt"), "upper");
      await writeText(p, at(p, "case.txt"), "lower");
      assert.equal((await p.list(root(p))).length, 1, "one entry: the names are the same file");
      assert.equal(await readText(p, at(p, "Case.txt")), "lower");
      return;
    }
    await writeText(p, at(p, "Case.txt"), "upper");
    await writeText(p, at(p, "case.txt"), "lower");
    assert.equal(await readText(p, at(p, "Case.txt")), "upper");
    assert.equal(await readText(p, at(p, "case.txt")), "lower");
    assert.equal((await p.list(root(p))).length, 2);
  });
}

test("vpath: '..' escaping the mount root is refused, inside-'..' resolves", () => {
  assert.throws(() => parseVPath("mem://t/a/../../etc/passwd"), (e: unknown) => codeOf(e) === "PermissionDenied");
  assert.throws(() => parseVPath("mem://t/.."), (e: unknown) => codeOf(e) === "PermissionDenied");
  const inside = parseVPath("mem://t/a/b/../c");
  assert.deepEqual([...inside.segments], ["a", "c"]);
});

test("vpath: NFC/NFD-colliding names compare equal, bytes preserved", () => {
  const nfc = parseVPath("mem://t/caf\u00e9.txt"); // e-acute, one code point (NFC)
  const nfd = parseVPath("mem://t/cafe\u0301.txt"); // e + combining acute (NFD)
  assert.equal(nfc.compareKey, nfd.compareKey);
  assert.notEqual(nfc.segments[0], nfd.segments[0]);
});

test("mem watch: native create/write/delete events, stops on abort", async () => {
  const p = createMemProvider("mem");
  const events: string[] = [];
  const controller = new AbortController();
  const done = p.watch(root(p), (event) => events.push(`${event.type}:${event.path.segments.join("/")}`), controller.signal);
  await writeText(p, at(p, "w.txt"), "1");
  await writeText(p, at(p, "w.txt"), "2");
  await p.delete(at(p, "w.txt"));
  controller.abort();
  await done;
  assert.deepEqual(events, ["create:w.txt", "write:w.txt", "delete:w.txt"]);
});

test("sandbox list: a name a shell made with a newline in it is left out, never split into two entries", async (t) => {
  if (!hasSh()) return t.skip("no sh");
  const dir = mkdtempSync(join(tmpdir(), "vfs-"));
  writeFileSync(join(dir, "line\nbreak.txt"), "");
  writeFileSync(join(dir, "ok.txt"), "");
  writeFileSync(join(dir, ".hidden"), "");
  const p = createSandboxProvider("sandbox", localShTransport(dir));
  assert.deepEqual((await p.list(root(p))).map((entry) => entry.name), [".hidden", "ok.txt"]);
});

test("sandbox hashes: the fs-agent's sha16 per file, null when absent, no entry for a directory — on sh and on a tty", async (t) => {
  if (!hasSh()) return t.skip("no sh");
  const dir = mkdtempSync(join(tmpdir(), "vfs-"));
  const files: Record<string, string> = { "a.c": "int a;\n", "with space.c": "é\n", "back\\slash.c": "x", "src/deep.c": "deep" };
  mkdirSync(join(dir, "src"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const expected = new Map<string, string | null>([["gone.c", null], ["src/gone 2.c", null]]);
  for (const [name, text] of Object.entries(files)) expected.set(name, await sha16(text));
  const paths = [...Object.keys(files), "src", "gone.c", "src/gone 2.c"];
  const ptys = hasSh("script", ["-qec", "exit 0", "/dev/null"]) ? [false, true] : [false];
  for (const overPty of ptys) assert.deepEqual(await sandboxHashes(localShTransport(dir, overPty), paths), expected, `overPty=${overPty}`);
});

test("overlay: lower-layer read-through, whiteout delete, merged listing", async () => {
  const upper = createMemProvider("mem");
  const lower = createMemProvider("mem");
  await lower.write(buildVPath("mem", "t", ["base.txt"]), textToBytes("from lower"));
  await lower.write(buildVPath("mem", "t", ["gone.txt"]), textToBytes("doomed"));
  const overlay = createOverlayProvider("overlay", upper, lower);
  assert.equal(await readText(overlay, at(overlay, "base.txt")), "from lower");
  await writeText(overlay, at(overlay, "top.txt"), "from upper");
  const names = (await overlay.list(root(overlay))).map((entry) => entry.name);
  assert.deepEqual(names, ["base.txt", "gone.txt", "top.txt"]);
  await overlay.delete(at(overlay, "gone.txt"));
  await assert.rejects(overlay.read(at(overlay, "gone.txt")), (e: unknown) => codeOf(e) === "NotFound");
  assert.deepEqual((await overlay.list(root(overlay))).map((entry) => entry.name), ["base.txt", "top.txt"]);
});

test("mount table routes by scheme://authority and refuses unknown mounts", async () => {
  const table = createMountTable();
  const mem = createMemProvider("mem");
  table.mount("mem", "ws1", mem);
  const { provider, path } = table.resolve("mem://ws1/a/b.txt");
  assert.equal(provider, mem);
  assert.deepEqual([...path.segments], ["a", "b.txt"]);
  assert.throws(() => table.resolve("sftp://elsewhere/x"), (e: unknown) => codeOf(e) === "Unsupported");
});
