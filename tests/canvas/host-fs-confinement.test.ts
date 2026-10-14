/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   host-fs-confinement.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostFsTransport } from "../../scripts/host-fs-ops.mjs";
import { outputOrThrow } from "../../src/features/ide/vfs/sandboxFsOps.ts";
import type { FsOpName, FsOpParams, FsOpResult } from "../../src/features/ide/vfs/sandboxFsOps.ts";

type Tr = (op: FsOpName, params: FsOpParams) => Promise<FsOpResult>;
const seenOutputs: string[] = [];
const seenRoots: string[] = [];
const b64 = (s: string): string => Buffer.from(s).toString("base64");
async function freshRoot(): Promise<{ root: string; tr: Tr; rootReal: string }> {
  const root = mkdtempSync(join(tmpdir(), "vfs-host-"));
  const tr = createHostFsTransport(root) as Tr;
  const rootReal = await fsp.realpath(root); seenRoots.push(rootReal);
  return { root, tr, rootReal };
}
async function mustFail(args: { tr: Tr; op: FsOpName; params: FsOpParams; want: string; rootReal: string }): Promise<void> {
  const r = await args.tr(args.op, args.params);
  assert.equal(r.exitCode, 1); assert.equal(r.output, `VFSERR:${args.want}`);
  seenOutputs.push(r.output); assert.ok(!r.output.includes(args.rootReal));
}
async function evilSetup(): Promise<{ root: string; tr: Tr; rootReal: string; evil: string; secret: string }> {
  const { root, tr, rootReal } = await freshRoot();
  const evil = `${root}-evil`; await fsp.mkdir(evil, { recursive: true });
  const secret = "top-secret-bytes";
  await fsp.writeFile(join(evil, "secret.txt"), secret);
  await fsp.symlink(evil, join(root, "s")); await fsp.symlink(join(evil, "secret.txt"), join(root, "sf"));
  await fsp.writeFile(join(root, "ok.txt"), "ok");
  return { root, tr, rootReal, evil, secret };
}

test("C2: root deletes are refused and contents survive", async () => {
  const { root, tr, rootReal } = await freshRoot();
  await fsp.writeFile(join(root, "keep.txt"), "keep");
  await mustFail({ tr, op: "delete", params: { path: ".", recursive: true }, want: "ECONFINE", rootReal });
  await mustFail({ tr, op: "delete", params: { path: "", recursive: true }, want: "ECONFINE", rootReal });
  assert.equal(await fsp.readFile(join(root, "keep.txt"), "utf8"), "keep");
});

test("C3/C4: escaping reads, lists, stats, writes, mkdirs and renames are ECONFINE", async () => {
  const { root, tr, rootReal, evil, secret } = await evilSetup();
  await mustFail({ tr, op: "read", params: { path: "sf" }, want: "ECONFINE", rootReal });
  await mustFail({ tr, op: "read", params: { path: "s/secret.txt" }, want: "ECONFINE", rootReal });
  await mustFail({ tr, op: "list", params: { path: "s" }, want: "ECONFINE", rootReal });
  await mustFail({ tr, op: "stat", params: { path: "s/secret.txt" }, want: "ECONFINE", rootReal });
  await mustFail({ tr, op: "write", params: { path: "s/new.txt", contentBase64: b64("x") }, want: "ECONFINE", rootReal });
  await mustFail({ tr, op: "write", params: { path: "sf", contentBase64: b64("x") }, want: "ECONFINE", rootReal });
  await mustFail({ tr, op: "mkdir", params: { path: "s/d" }, want: "ECONFINE", rootReal });
  await mustFail({ tr, op: "rename", params: { path: "sf", to: "moved" }, want: "ECONFINE", rootReal });
  await mustFail({ tr, op: "rename", params: { path: "ok.txt", to: "s/ok.txt" }, want: "ECONFINE", rootReal });
  assert.equal(await fsp.readFile(join(evil, "secret.txt"), "utf8"), secret);
  assert.equal((await fsp.readFile(join(root, "ok.txt"), "utf8")), "ok");
});

test("C4: deleting an escaping link removes only the link", async () => {
  const { root, tr, evil, secret } = await evilSetup();
  await fsp.mkdir(join(root, "dir")); await fsp.symlink(evil, join(root, "dir", "link"));
  const del = await tr("delete", { path: "s" }); assert.equal(del.exitCode, 0);
  assert.equal(await fsp.readFile(join(evil, "secret.txt"), "utf8"), secret);
  const rec = await tr("delete", { path: "dir", recursive: true }); assert.equal(rec.exitCode, 0);
  assert.equal(await fsp.readFile(join(evil, "secret.txt"), "utf8"), secret);
});

test("C5: rename-swap race never exposes the outside dir", async () => {
  const { root, tr } = await freshRoot();
  const outside = `${root}-evil`; await fsp.mkdir(outside, { recursive: true });
  const secret = "race-secret"; await fsp.writeFile(join(outside, "secret.txt"), secret);
  await fsp.mkdir(join(root, "inner")); await fsp.symlink(outside, join(root, "evil"));
  const secretB64 = Buffer.from(secret).toString("base64");
  const reads: string[] = [];
  for (let i = 0; i < 200; i++) {
    const w = tr("write", { path: "inner/f.txt", contentBase64: b64(`v${i}`) });
    const r = tr("read", { path: "inner/secret.txt" }).then((res) => { if (res.exitCode === 0) reads.push(res.output); return res; });
    const a = tr("rename", { path: "inner", to: "tmp" }); const b = tr("rename", { path: "evil", to: "inner" });
    const c = tr("rename", { path: "inner", to: "evil" }); const d = tr("rename", { path: "tmp", to: "inner" });
    await Promise.all([w, r, a, b, c, d]);
  }
  for (const o of reads) assert.notEqual(o, secretB64);
  assert.deepEqual(await fsp.readdir(outside), ["secret.txt"]);
  assert.equal(await fsp.readFile(join(outside, "secret.txt"), "utf8"), secret);
});

test("C6: mode preserved and no vfstmp left after failed rename", async () => {
  const { root, tr } = await freshRoot();
  const p = join(root, "run.sh"); await fsp.writeFile(p, "hi"); await fsp.chmod(p, 0o755);
  const w = await tr("write", { path: "run.sh", contentBase64: b64("bye") }); assert.equal(w.exitCode, 0);
  assert.equal((await fsp.stat(p)).mode & 0o777, 0o755);
  const real = await import("node:fs/promises");
  const evilFs = { ...real, rename: () => Promise.reject(Object.assign(new Error("boom"), { code: "EIO" })) };
  const tr2 = createHostFsTransport(root, { fs: evilFs }) as Tr;
  const r2 = await tr2("write", { path: "run.sh", contentBase64: b64("again") });
  assert.equal(r2.exitCode, 1); assert.equal(r2.output, "VFSERR:EIO");
  assert.ok(!(await fsp.readdir(root)).some((n) => n.includes(".vfstmp")));
});

test("C7: recursive delete stops at a foreign device", async () => {
  const { root, tr } = await freshRoot();
  await fsp.mkdir(join(root, "top", "sub"), { recursive: true });
  await fsp.writeFile(join(root, "top", "sub", "f.txt"), "x");
  const real = await import("node:fs/promises");
  const subReal = await real.realpath(join(root, "top", "sub"));
  const subDev = 999999;
  const wrapFs = { ...real, lstat: async (q: string, o?: object): Promise<import("node:fs").Stats> => { const s = await real.lstat(q, o); if (q === subReal) return { ...s, dev: subDev, isDirectory: () => true, isSymbolicLink: () => false, isFile: () => false } as unknown as import("node:fs").Stats; return s; } };
  const tr2 = createHostFsTransport(root, { fs: wrapFs }) as Tr;
  const r = await tr2("delete", { path: "top", recursive: true });
  assert.equal(r.exitCode, 1); assert.equal(r.output, "VFSERR:ECONFINE");
  assert.equal(await fsp.readFile(join(root, "top", "sub", "f.txt"), "utf8"), "x");
  void tr;
});

test("C9: ranged reads capped on the range; EACCES and taxonomy map", async () => {
  const { root, tr, rootReal } = await freshRoot();
  const big = Buffer.alloc(1024 * 1024, 7); await fsp.writeFile(join(root, "big.bin"), big);
  const head = await tr("read", { path: "big.bin", offset: 0, length: 10 });
  assert.equal(head.exitCode, 0); assert.equal(Buffer.from(head.output, "base64").length, 10);
  await mustFail({ tr, op: "read", params: { path: "big.bin" }, want: "E2BIG", rootReal });
  const real = await import("node:fs/promises");
  const denyFs = { ...real, open: () => Promise.reject(Object.assign(new Error("denied"), { code: "EACCES" })) };
  const trDeny = createHostFsTransport(root, { fs: denyFs }) as Tr;
  await mustFail({ tr: trDeny, op: "read", params: { path: "big.bin", offset: 0, length: 10 }, want: "EACCES", rootReal });
  assert.throws(() => outputOrThrow({ exitCode: 1, output: "VFSERR:ECONFINE" }, "host://t/x"), (e: unknown) => (e as { code: string }).code === "PermissionDenied");
  assert.throws(() => outputOrThrow({ exitCode: 1, output: "VFSERR:EACCES" }, "host://t/x"), (e: unknown) => (e as { code: string }).code === "PermissionDenied");
  assert.throws(() => outputOrThrow({ exitCode: 1, output: "VFSERR:EPERM" }, "host://t/x"), (e: unknown) => (e as { code: string }).code === "PermissionDenied");
  assert.throws(() => outputOrThrow({ exitCode: 1, output: "VFSERR:EUNSUP" }, "host://t/x"), (e: unknown) => (e as { code: string }).code === "Unsupported");
  const unk = await tr("nope" as FsOpName, { path: "x" }); assert.equal(unk.output, "VFSERR:EUNSUP");
  seenOutputs.push(unk.output);
  const ghost = createHostFsTransport(join(root, "missing")) as Tr;
  const g = await ghost("list", { path: "" }); assert.equal(g.output, "VFSERR:ENOENT"); seenOutputs.push(g.output);
});

test("outputs never contain the real root", () => {
  assert.ok(seenRoots.length > 0 && seenOutputs.length > 0);
  for (const o of seenOutputs) for (const r of seenRoots) assert.ok(!o.includes(r), `leaked ${r}`);
});
