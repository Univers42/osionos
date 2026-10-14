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

import { join, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { constants as FS_CONST } from "node:fs";
import * as defaultFs from "node:fs/promises";
import { READ_CAP_BYTES } from "./ide-sandbox-spec.mjs";
import { pathRefusal, isInsideRoot } from "./host-fs-path.mjs";
import { removeTreeNoFollow } from "./host-fs-tree.mjs";
const O_RN = (FS_CONST.O_RDONLY ?? 0) | (FS_CONST.O_NOFOLLOW ?? 0);
const O_WX = (FS_CONST.O_WRONLY ?? 0) | (FS_CONST.O_CREAT ?? 0) | (FS_CONST.O_EXCL ?? 0) | (FS_CONST.O_NOFOLLOW ?? 0);
const fail = (t) => ({ exitCode: 1, output: `VFSERR:${t}` });
const ok = (o) => ({ exitCode: 0, output: o });
const MUT = new Set(["mkdir", "delete", "rename", "write"]);
/** O(1) — the single Node errno mapping, so outputs never leak paths. */
function tagOf(err) { const m = { ENOENT: "ENOENT", EEXIST: "EEXIST", ENOTEMPTY: "ENOTEMPTY", ENOTDIR: "ENOTDIR", EISDIR: "EISDIR", EACCES: "EACCES", EPERM: "EPERM", ELOOP: "ECONFINE" }; return m[err?.code] ?? "EIO"; }
/** O(1) — last-slash split of an already validated relative path. */
function splitParent(rel) { const i = rel.lastIndexOf("/"); return i === -1 ? ["", rel] : [rel.slice(0, i), rel.slice(i + 1)]; }
/** O(1) plus O(n) to copy the range — reads exactly n bytes, never the whole file. */
async function doRead(ctx, params) {
  if (params.path === "") return fail("EISDIR");
  const { fs, rootReal } = ctx; let real;
  try { real = await fs.realpath(join(rootReal, params.path)); } catch { return fail("ENOENT"); }
  if (!isInsideRoot(rootReal, real, sep)) return fail("ECONFINE");
  let st; try { st = await fs.stat(real); } catch (e) { return fail(tagOf(e)); }
  if (st.isDirectory()) return fail("EISDIR");
  const off = Number.isInteger(params.offset) && params.offset >= 0 ? params.offset : 0;
  let n = Number.isInteger(params.length) && params.length >= 0 ? params.length : st.size - off; n = Math.min(n, Math.max(0, st.size - off));
  if (n > READ_CAP_BYTES) return fail("E2BIG"); if (n <= 0) return ok("");
  let fh; try { fh = await fs.open(real, O_RN); } catch (e) { return fail(tagOf(e)); }
  try { const buf = Buffer.alloc(n); const { bytesRead } = await fh.read(buf, 0, n, off); return ok(buf.subarray(0, bytesRead).toString("base64")); } catch (e) { return fail(tagOf(e)); } finally { try { await fh.close(); } catch {} }
}
/** O(1) — one realpath plus one stat, no listing. */
async function doStat(ctx, params) {
  const { fs, rootReal } = ctx; let real = rootReal;
  if (params.path !== "") { try { real = await fs.realpath(join(rootReal, params.path)); } catch { return fail("ENOENT"); } if (!isInsideRoot(rootReal, real, sep)) return fail("ECONFINE"); }
  let st; try { st = await fs.stat(real); } catch (e) { return fail(tagOf(e)); }
  const mtime = Math.floor(st.mtimeMs / 1000);
  if (st.isDirectory()) return ok(`dir|0|${mtime}`); return ok(`file|${st.size}|${mtime}`);
}
/** O(n log n) where n is the entry count — one readdir, sort dominates. */
async function doList(ctx, params) {
  const { fs, rootReal } = ctx; let real = rootReal;
  if (params.path !== "") { try { real = await fs.realpath(join(rootReal, params.path)); } catch { return fail("ENOENT"); } if (!isInsideRoot(rootReal, real, sep)) return fail("ECONFINE"); }
  let st; try { st = await fs.stat(real); } catch (e) { return fail(tagOf(e)); }
  if (!st.isDirectory()) return fail("ENOTDIR");
  let entries; try { entries = await fs.readdir(real, { withFileTypes: true }); } catch (e) { return fail(tagOf(e)); }
  const out = [];
  for (const d of entries) {
    const name = typeof d === "string" ? d : d.name;
    // Ponytail: the `name per line` format cannot carry \n or \r — such files are under-reported, never mangled.
    if (name.includes("\n") || name.includes("\r")) continue;
    const isDir = typeof d === "string" ? false : d.isDirectory(); out.push(isDir ? `${name}/` : name);
  }
  out.sort(); return ok(out.join("\n"));
}
/** O(1) — parent realpath plus target lstat, no recursion. */
async function doMkdir(ctx, params) {
  if (params.path === "") return fail("ECONFINE");
  const { fs, rootReal } = ctx; const [dirRel, name] = splitParent(params.path); let parent = rootReal;
  if (dirRel !== "") { try { parent = await fs.realpath(join(rootReal, dirRel)); } catch { return fail("ENOPARENT"); } if (!isInsideRoot(rootReal, parent, sep)) return fail("ECONFINE"); let pst; try { pst = await fs.stat(parent); } catch (e) { return fail(tagOf(e)); } if (!pst.isDirectory()) return fail("ENOPARENT"); }
  try { await fs.lstat(join(parent, name)); return fail("EEXIST"); } catch (e) { if (e?.code !== "ENOENT") return fail(tagOf(e)); }
  try { await fs.mkdir(join(parent, name)); } catch (e) { return fail(tagOf(e)); }
  return ok("");
}
/** O(n) where n is the removed entry count — recursion lives in removeTree. */
async function doDelete(ctx, params) {
  if (params.path === "") return fail("ECONFINE");
  const { fs, rootReal, rootDev, removeTree } = ctx; const [dirRel, name] = splitParent(params.path); let parent = rootReal;
  if (dirRel !== "") { try { parent = await fs.realpath(join(rootReal, dirRel)); } catch { return fail("ENOENT"); } if (!isInsideRoot(rootReal, parent, sep)) return fail("ECONFINE"); }
  const abs = join(parent, name); let st;
  try { st = await fs.lstat(abs); } catch (e) { return fail(tagOf(e)); }
  if (st.isSymbolicLink() || !st.isDirectory()) { try { await fs.unlink(abs); } catch (e) { return fail(tagOf(e)); } return ok(""); }
  if (params.recursive !== true) { try { await fs.rmdir(abs); } catch { return fail("ENOTEMPTY"); } return ok(""); }
  try { await removeTree(abs, { rootDev, fs }); } catch (e) { if (e?.code === "ECONFINE") return fail("ECONFINE"); return fail(tagOf(e)); }
  return ok("");
}
/** O(1) — a bounded number of lstat/realpath calls, no listing. */
async function doRename(ctx, params) {
  if (params.path === "" || params.to === "") return fail("ECONFINE");
  const { fs, rootReal } = ctx; const [sDir, sName] = splitParent(params.path); const [dDir, dName] = splitParent(params.to); let sParent = rootReal;
  if (sDir !== "") { try { sParent = await fs.realpath(join(rootReal, sDir)); } catch { return fail("ENOENT"); } if (!isInsideRoot(rootReal, sParent, sep)) return fail("ECONFINE"); }
  const sAbs = join(sParent, sName); let sSt;
  try { sSt = await fs.lstat(sAbs); } catch (e) { return fail(tagOf(e)); }
  if (sSt.isSymbolicLink()) { let r; try { r = await fs.realpath(sAbs); } catch { return fail("ECONFINE"); } if (!isInsideRoot(rootReal, r, sep)) return fail("ECONFINE"); }
  let dParent = rootReal;
  if (dDir !== "") { try { dParent = await fs.realpath(join(rootReal, dDir)); } catch { return fail("ENOPARENT"); } if (!isInsideRoot(rootReal, dParent, sep)) return fail("ECONFINE"); let pst; try { pst = await fs.stat(dParent); } catch (e) { return fail(tagOf(e)); } if (!pst.isDirectory()) return fail("ENOPARENT"); }
  const dAbs = join(dParent, dName); let dSt = null;
  try { dSt = await fs.lstat(dAbs); } catch (e) { if (e?.code !== "ENOENT") return fail(tagOf(e)); }
  if (dSt) { if (params.overwrite !== true) return fail("EEXIST"); if (sSt.isDirectory() || dSt.isDirectory()) return fail("EEXIST"); }
  try { await fs.rename(sAbs, dAbs); } catch (e) { return fail(tagOf(e)); }
  return ok("");
}
/** O(d) where d is the parent depth — one lstat/mkdir per missing segment. */
async function doWrite(ctx, params) {
  if (params.path === "") return fail("ECONFINE"); if (typeof params.contentBase64 !== "string") return fail("EIO");
  const { fs, rootReal } = ctx; const segs = params.path.split("/"); const final = segs[segs.length - 1]; let cur = rootReal;
  for (const seg of segs.slice(0, -1)) {
    const cand = join(cur, seg); let st = null;
    try { st = await fs.lstat(cand); } catch (e) { if (e?.code !== "ENOENT") return fail(tagOf(e)); }
    if (!st) { try { await fs.mkdir(cand); } catch { return fail("EIO"); } cur = cand; continue; }
    if (st.isSymbolicLink()) { let r; try { r = await fs.realpath(cand); } catch { return fail("ECONFINE"); } if (!isInsideRoot(rootReal, r, sep)) return fail("ECONFINE"); let rst; try { rst = await fs.stat(r); } catch (e) { return fail(tagOf(e)); } if (!rst.isDirectory()) return fail("EIO"); cur = r; continue; }
    if (!st.isDirectory()) return fail("EIO"); cur = cand;
  }
  const target = join(cur, final); let mode = 0o666; let fSt = null;
  try { fSt = await fs.lstat(target); } catch (e) { if (e?.code !== "ENOENT") return fail(tagOf(e)); }
  if (fSt) { if (fSt.isDirectory()) return fail("EISDIR"); if (fSt.isSymbolicLink()) { let r; try { r = await fs.realpath(target); } catch { return fail("ECONFINE"); } if (!isInsideRoot(rootReal, r, sep)) return fail("ECONFINE"); let rst; try { rst = await fs.stat(r); } catch (e) { return fail(tagOf(e)); } if (rst.isDirectory()) return fail("EISDIR"); if (rst.isFile()) mode = rst.mode & 0o7777; } else if (fSt.isFile()) mode = fSt.mode & 0o7777; }
  const bytes = Buffer.from(params.contentBase64, "base64"); const tmp = join(cur, `${final}.vfstmp${randomBytes(8).toString("hex")}`); let fh = null; let made = false;
  try { fh = await fs.open(tmp, O_WX, mode); made = true; } catch (e) { return fail(tagOf(e)); }
  try { await fh.writeFile(bytes); await fh.close(); fh = null; await fs.chmod(tmp, mode); await fs.rename(tmp, target); made = false; return ok(""); } catch { try { if (fh) await fh.close(); } catch {} if (made) try { await fs.unlink(tmp); } catch {} return fail("EIO"); }
}
/** O(1) per op dispatch — fs work lives in the per-op helpers. */
async function loadRoot(state) {
  if (!state.cached) { state.cached = (async () => { try { const rootReal = await state.fs.realpath(state.rootDir); const rootDev = (await state.fs.stat(rootReal)).dev; return { rootReal, rootDev }; } catch { return null; } })(); }
  return state.cached;
}
/** O(1) dispatch — validation first, so no fs call leaks a refused path. */
async function runOne(state, op, params) {
  if (op !== "read" && op !== "list" && op !== "stat" && !MUT.has(op)) return fail("EUNSUP");
  const bad = pathRefusal(params?.path, { platform: state.platform, mutating: MUT.has(op) }); if (bad) return fail(bad);
  if (op === "rename") { const badTo = pathRefusal(params?.to, { platform: state.platform, mutating: true }); if (badTo) return fail(badTo); }
  let root; try { root = await loadRoot(state); } catch { return fail("EIO"); }
  if (!root) return fail("ENOENT");
  const ctx = { rootReal: root.rootReal, rootDev: root.rootDev, fs: state.fs, removeTree: state.removeTree };
  try {
    if (op === "read") return await doRead(ctx, params); if (op === "stat") return await doStat(ctx, params);
    if (op === "list") return await doList(ctx, params); if (op === "mkdir") return await doMkdir(ctx, params);
    if (op === "delete") return await doDelete(ctx, params); if (op === "rename") return await doRename(ctx, params);
    if (op === "write") return await doWrite(ctx, params); return fail("EUNSUP");
  } catch { return fail("EIO"); }
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
  return (op, params) => { const job = () => runOne(state, op, params); const next = tail.then(job, job); tail = next.then(() => undefined, () => undefined); return next; };
}
