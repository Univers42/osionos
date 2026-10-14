/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   host-fs-toctou.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Check-then-use gaps: every finding here is a window between the moment the
// transport proves a path is inside the root and the moment it uses that path.
// Each test injects the swap, because on a healthy machine none of them fire.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { Stats } from "node:fs";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostFsTransport } from "../../scripts/host-fs-ops.mjs";
import type { FsOpName, FsOpParams, FsOpResult } from "../../src/features/ide/vfs/sandboxFsOps.ts";

const realFs = await import("node:fs/promises");
type Tr = (op: FsOpName, params: FsOpParams) => Promise<FsOpResult>;
const b64 = (s: string): string => Buffer.from(s).toString("base64");
/** The same Stats with another inode — what a swapped directory looks like. */
function withIno(st: Stats, ino: number): Stats {
  const own = Object.getOwnPropertyDescriptors(st);
  own.ino = { value: ino, writable: true, enumerable: true, configurable: true };
  return Object.create(Object.getPrototypeOf(st), own) as Stats;
}

test("F1: a root turned into a symlink answers ENOENT and never reaches outside", async () => {
  const root = mkdtempSync(join(tmpdir(), "vfs-host-"));
  const outside = `${root}-outside`;
  await fsp.mkdir(outside, { recursive: true });
  await fsp.writeFile(join(outside, "keep.txt"), "keep-bytes");
  await fsp.writeFile(join(outside, "victim"), "outside-victim");
  await fsp.writeFile(join(root, "victim"), "inside-victim");
  const tr = createHostFsTransport(root) as Tr;
  assert.equal((await tr("list", { path: "" })).exitCode, 0);
  await fsp.rename(root, `${root}-moved`);
  await fsp.symlink(outside, root);
  const ops: [FsOpName, FsOpParams][] = [
    ["list", { path: "" }],
    ["write", { path: "planted", contentBase64: b64("planted") }],
    ["delete", { path: "victim" }],
    ["mkdir", { path: "d" }],
  ];
  for (const [op, params] of ops) {
    const r = await tr(op, params);
    assert.equal(r.exitCode, 1, op);
    assert.equal(r.output, "VFSERR:ENOENT", op);
  }
  assert.deepEqual([...(await fsp.readdir(outside))].sort(), ["keep.txt", "victim"]);
  assert.equal(await fsp.readFile(join(outside, "victim"), "utf8"), "outside-victim");
  assert.equal(await fsp.readFile(join(outside, "keep.txt"), "utf8"), "keep-bytes");
});

test("F2: a write chmods the open handle, never a path", async () => {
  const root = mkdtempSync(join(tmpdir(), "vfs-host-"));
  const target = join(root, "run.sh");
  await fsp.writeFile(target, "hi");
  await fsp.chmod(target, 0o750);
  const handleModes: number[] = [];
  let pathChmods = 0;
  const hooked = {
    ...realFs,
    chmod: (): Promise<void> => { pathChmods++; return Promise.resolve(); },
    open: async (p: string, flags?: number, mode?: number) => {
      const fh = await realFs.open(p, flags ?? 0, mode);
      const onHandle = fh.chmod.bind(fh);
      fh.chmod = (m: number): Promise<void> => { handleModes.push(m); return onHandle(m); };
      return fh;
    },
  } as unknown as typeof realFs;
  const tr = createHostFsTransport(root, { fs: hooked }) as Tr;
  const w = await tr("write", { path: "run.sh", contentBase64: b64("chmodded") });
  assert.equal(w.exitCode, 0);
  assert.deepEqual(handleModes, [0o750]);
  assert.equal(pathChmods, 0);
  assert.equal((await fsp.stat(target)).mode & 0o777, 0o750);
  assert.equal(await fsp.readFile(target, "utf8"), "chmodded");
});

test("F3: a folder that changes identity after readdir stops the walk as ECONFINE", async () => {
  const root = mkdtempSync(join(tmpdir(), "vfs-host-"));
  await fsp.mkdir(join(root, "top", "sub"), { recursive: true });
  await fsp.writeFile(join(root, "top", "sub", "f.txt"), "keep");
  const topAbs = await fsp.realpath(join(root, "top"));
  const removed: string[] = [];
  let swapped = false;
  const hooked = {
    ...realFs,
    readdir: (p: string, o?: object) => { if (p === topAbs) swapped = true; return realFs.readdir(p, o); },
    lstat: async (p: string, o?: object) => {
      const st = await realFs.lstat(p, o);
      return swapped && p === topAbs ? withIno(st, st.ino + 1) : st;
    },
    unlink: (p: string) => { removed.push(`unlink ${p}`); return realFs.unlink(p); },
    rmdir: (p: string) => { removed.push(`rmdir ${p}`); return realFs.rmdir(p); },
  } as unknown as typeof realFs;
  const tr = createHostFsTransport(root, { fs: hooked }) as Tr;
  const r = await tr("delete", { path: "top", recursive: true });
  assert.equal(r.exitCode, 1);
  assert.equal(r.output, "VFSERR:ECONFINE");
  assert.deepEqual(removed, [], "no entry under the swapped folder was touched");
  assert.equal(await fsp.readFile(join(root, "top", "sub", "f.txt"), "utf8"), "keep");
});

test("F4: a read whose name re-resolves outside is refused as ECONFINE", async () => {
  const root = mkdtempSync(join(tmpdir(), "vfs-host-"));
  const outside = `${root}-outside`;
  await fsp.mkdir(outside, { recursive: true });
  const secret = "outside-secret-bytes";
  await fsp.writeFile(join(outside, "secret.txt"), secret);
  await fsp.writeFile(join(root, "f.txt"), "inside-bytes");
  const targetAbs = join(await fsp.realpath(root), "f.txt");
  const outsideAbs = await fsp.realpath(join(outside, "secret.txt"));
  const hits = new Map<string, number>();
  const hooked = {
    ...realFs,
    realpath: (p: string) => {
      const n = (hits.get(p) ?? 0) + 1;
      hits.set(p, n);
      return n === 2 && p === targetAbs ? Promise.resolve(outsideAbs) : realFs.realpath(p);
    },
  } as unknown as typeof realFs;
  const tr = createHostFsTransport(root, { fs: hooked }) as Tr;
  const r = await tr("read", { path: "f.txt" });
  assert.equal(r.exitCode, 1);
  assert.equal(r.output, "VFSERR:ECONFINE");
  assert.ok(!r.output.includes(Buffer.from(secret).toString("base64")));
  assert.ok(!r.output.includes(Buffer.from("inside-bytes").toString("base64")));
});
