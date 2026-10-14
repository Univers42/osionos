/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   host-fs-ops.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Buffer } from "node:buffer";
import process from "node:process";
import { constants as FS_CONST } from "node:fs";
import * as defaultFs from "node:fs/promises";
import { READ_CAP_BYTES } from "./ide-sandbox-spec.mjs";
import { pathRefusal } from "./host-fs-path.mjs";
import { removeTreeNoFollow } from "./host-fs-tree.mjs";
import { attempt, resolveInside, doDelete, doMkdir, doRename, doWrite } from "./host-fs-write.mjs";

const O_RN = (FS_CONST.O_RDONLY ?? 0) | (FS_CONST.O_NOFOLLOW ?? 0);
const fail = (t) => ({ exitCode: 1, output: `VFSERR:${t}` });
const ok = (o) => ({ exitCode: 0, output: o });
const MUT = new Set(["mkdir", "delete", "rename", "write"]);
// O(1) — one errno to tag. A Map, not an object literal: `err.code` is untrusted,
// and an object literal would answer "__proto__" with an object instead of nothing.
const ERRNO_TAGS = new Map([["ENOENT", "ENOENT"], ["EEXIST", "EEXIST"], ["ENOTEMPTY", "ENOTEMPTY"], ["ENOTDIR", "ENOTDIR"], ["EISDIR", "EISDIR"], ["EACCES", "EACCES"], ["EPERM", "EPERM"], ["ELOOP", "ECONFINE"]]);

/** O(1) — the single Node errno mapping, so outputs never leak paths. */
function tagOf(err) {
  return ERRNO_TAGS.get(err?.code) ?? "EIO";
}

/** O(1) plus O(n) over the range — never materializes the whole file. */
async function doRead(ctx, params) {
  if (params.path === "") return fail("EISDIR");
  const r = await resolveInside(ctx, params.path, "ENOENT");
  if (r.result) return r.result;
  if (r.st.isDirectory()) return fail("EISDIR");
  const off = Number.isInteger(params.offset) && params.offset >= 0 ? params.offset : 0;
  let n = Number.isInteger(params.length) && params.length >= 0 ? params.length : r.st.size - off;
  n = Math.min(n, Math.max(0, r.st.size - off));
  if (n > READ_CAP_BYTES) return fail("E2BIG");
  if (n <= 0) return ok("");
  return readRange(ctx, { rel: params.path, real: r.real, off, n });
}

/**
 * Copy the range through the handle, then re-resolve the name: handle and path
 * must still be one inode or the bytes are not ours to hand back.
 * O(1) syscalls; O(n) in the copied range.
 */
async function readRange(ctx, job) {
  const opened = await attempt(ctx.fs.open(job.real, O_RN), tagOf);
  if (opened.result) return opened.result;
  const fh = opened.value;
  try {
    if (!(await handleStillInside(ctx, job.rel, fh))) return fail("ECONFINE");
    const buf = Buffer.alloc(job.n);
    const read = await attempt(fh.read(buf, 0, job.n, job.off), tagOf);
    if (read.result) return read.result;
    return ok(buf.subarray(0, read.value.bytesRead).toString("base64"));
  } finally {
    // the handle is spent either way; the answer above is already decided
    await attempt(fh.close(), () => "EIO");
  }
}

/** O(1) — the handle must still name the path we resolved, device and inode. */
async function handleStillInside(ctx, rel, fh) {
  const held = await fh.stat();
  const again = await resolveInside(ctx, rel, "ECONFINE");
  if (again.result) return false;
  return held.dev === again.st.dev && held.ino === again.st.ino;
}

/** O(1) — one realpath plus one stat, no listing. */
async function doStat(ctx, params) {
  const r = await resolveInside(ctx, params.path, "ENOENT");
  if (r.result) return r.result;
  const mtime = Math.floor(r.st.mtimeMs / 1000);
  if (r.st.isDirectory()) return ok(`dir|0|${mtime}`);
  return ok(`file|${r.st.size}|${mtime}`);
}

/** O(n log n) where n is the entry count — one readdir, sort dominates. */
async function doList(ctx, params) {
  const r = await resolveInside(ctx, params.path, "ENOENT");
  if (r.result) return r.result;
  if (!r.st.isDirectory()) return fail("ENOTDIR");
  const read = await attempt(ctx.fs.readdir(r.real, { withFileTypes: true }), tagOf);
  if (read.result) return read.result;
  const out = [];
  for (const d of read.value) {
    const name = typeof d === "string" ? d : d.name;
    // Ponytail: the `name per line` format cannot carry \n or \r — such files are under-reported, never mangled.
    if (name.includes("\n") || name.includes("\r")) continue;
    const isDir = typeof d === "string" ? false : d.isDirectory();
    out.push(isDir ? `${name}/` : name);
  }
  out.sort();
  return ok(out.join("\n"));
}

/** O(1) — the root, its device and its inode, resolved once per transport. */
async function resolveRoot(state) {
  const real = await attempt(state.fs.realpath(state.rootDir), tagOf);
  if (real.result) return null;
  const st = await attempt(state.fs.stat(real.value), tagOf);
  if (st.result) return null;
  return { rootReal: real.value, rootDev: st.value.dev, rootIno: st.value.ino };
}

/**
 * The op context, with the root re-checked once per op: a root turned into a
 * symlink, moved away or replaced answers ENOENT, because the folder the
 * caller picked is no longer the folder we resolved and confined to.
 * O(1) — one lstat per op, no cache of its own.
 */
async function ctxFor(state) {
  // Ponytail: the root is cached for the life of the transport — it is wrong the
  // moment the chosen folder is replaced by a different one at the same path, and
  // the answer is ENOENT for every later op until a new transport is built.
  if (state.cached === null) state.cached = resolveRoot(state);
  const root = await state.cached;
  if (root === null) return null;
  const here = await attempt(state.fs.lstat(root.rootReal), tagOf);
  const st = here.value;
  if (st === null || st.isSymbolicLink() || !st.isDirectory()) return null;
  if (st.dev !== root.rootDev || st.ino !== root.rootIno) return null;
  return { rootReal: root.rootReal, rootDev: root.rootDev, fs: state.fs, removeTree: state.removeTree, tag: tagOf };
}

/** O(1) — the op table. A Map, so a crafted op name reaches no prototype member. */
const DISPATCH = new Map([
  ["read", doRead], ["stat", doStat], ["list", doList],
  ["mkdir", doMkdir], ["delete", doDelete], ["rename", doRename], ["write", doWrite],
]);

/** O(1) dispatch — validation first, so no fs call leaks a refused path. */
async function runOne(state, op, params) {
  const run = DISPATCH.get(op);
  if (run === undefined) return fail("EUNSUP");
  const bad = pathRefusal(params?.path, { platform: state.platform, mutating: MUT.has(op) });
  if (bad) return fail(bad);
  if (op === "rename") {
    const badTo = pathRefusal(params?.to, { platform: state.platform, mutating: true });
    if (badTo) return fail(badTo);
  }
  const ctx = await ctxFor(state);
  if (ctx === null) return fail("ENOENT");
  try {
    return await run(ctx, params);
  } catch {
    // the helpers answer in tags; this only catches a bug inside one of them
    return fail("EIO");
  }
}

/**
 * Build the host transport twin of the sandbox fs ops, confined to one root.
 * O(1) to construct — the root is resolved lazily once, then cached.
 * @param {string} rootDir host folder to confine all ops to
 * @param {{ platform?: string, fs?: object, removeTree?: Function }} options injectable platform/fs/tree
 * @returns {Function} an FsOpTransport that never throws, only returns results
 */
export function createHostFsTransport(rootDir, options = {}) {
  const state = { platform: options.platform ?? process.platform, fs: options.fs ?? defaultFs, removeTree: options.removeTree ?? removeTreeNoFollow, rootDir, cached: null };
  let tail = Promise.resolve();
  // Ponytail: the chain orders only this instance's calls — an external process racing realpath against rename can still slip between check and use.
  return (op, params) => {
    const job = () => runOne(state, op, params);
    const next = tail.then(job, job);
    tail = next.then(() => undefined, () => undefined);
    return next;
  };
}
