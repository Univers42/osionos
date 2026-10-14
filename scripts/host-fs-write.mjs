/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   host-fs-write.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The confined mutation path — mkdir, delete, rename, write — plus `attempt` and
// `resolveInside`, the two pieces host-fs-ops.mjs imports from here: an import cycle
// would leave two copies of the confinement rule, and only one of them in force.
import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { constants as FS_CONST } from "node:fs";
import { join, sep } from "node:path";
import { isInsideRoot } from "./host-fs-path.mjs";

const O_WX = (FS_CONST.O_WRONLY ?? 0) | (FS_CONST.O_CREAT ?? 0) | (FS_CONST.O_EXCL ?? 0) | (FS_CONST.O_NOFOLLOW ?? 0);
const fail = (t) => ({ exitCode: 1, output: `VFSERR:${t}` });
const ok = (o) => ({ exitCode: 0, output: o });
const DEFAULT_MODE = 0o666;

/** O(1) — one fs call with its refusal mapped to a tag; `value` is the answer. */
export async function attempt(promise, tag) {
  try {
    return { value: await promise, tag: null, result: null };
  } catch (e) {
    const t = tag(e);
    return { value: null, tag: t, result: fail(t) };
  }
}

/**
 * Resolve a root-relative path to an absolute one still under the root, then stat
 * it: a link chain leaving the root is refused before the name is ever used.
 * O(1) syscalls; O(l) in the path length for the `root + sep` prefix compare.
 */
export async function resolveInside(ctx, rel, missingTag) {
  let real = ctx.rootReal;
  if (rel !== "") {
    const found = await attempt(ctx.fs.realpath(join(ctx.rootReal, rel)), () => missingTag);
    if (found.value === null) {
      // a missing segment or a link loop: the caller owns that distinction
      return { real: "", st: null, result: found.result };
    }
    if (!isInsideRoot(ctx.rootReal, found.value, sep)) {
      // the chain left the root, so no further name may be appended to it
      return { real: "", st: null, result: fail("ECONFINE") };
    }
    real = found.value;
  }
  const st = await attempt(ctx.fs.stat(real), ctx.tag);
  return { real: st.value === null ? "" : real, st: st.value, result: st.result };
}

/** O(1) dispatch plus O(l) for the two slices of an already validated path. */
function splitParent(rel) {
  const i = rel.lastIndexOf("/");
  if (i === -1) return ["", rel];
  return [rel.slice(0, i), rel.slice(i + 1)];
}

/** O(1) — parent realpath plus target lstat, no recursion. */
export async function doMkdir(ctx, params) {
  if (params.path === "") return fail("ECONFINE");
  const [dirRel, name] = splitParent(params.path);
  const parent = await resolveInside(ctx, dirRel, "ENOPARENT");
  if (parent.result) return parent.result;
  if (!parent.st.isDirectory()) return fail("ENOPARENT");
  const abs = join(parent.real, name);
  const probe = await attempt(ctx.fs.lstat(abs), ctx.tag);
  if (probe.value !== null) return fail("EEXIST");
  if (probe.tag !== "ENOENT") return probe.result;
  const made = await attempt(ctx.fs.mkdir(abs), ctx.tag);
  return made.result ?? ok("");
}

/** O(n) where n is the removed entry count — recursion lives in the tree walk. */
export async function doDelete(ctx, params) {
  if (params.path === "") return fail("ECONFINE");
  const [dirRel, name] = splitParent(params.path);
  const parent = await resolveInside(ctx, dirRel, "ENOENT");
  if (parent.result) return parent.result;
  const abs = join(parent.real, name);
  const st = await attempt(ctx.fs.lstat(abs), ctx.tag);
  if (st.result) return st.result;
  if (st.value.isSymbolicLink() || !st.value.isDirectory()) {
    const gone = await attempt(ctx.fs.unlink(abs), ctx.tag);
    return gone.result ?? ok("");
  }
  if (params.recursive !== true) {
    const empty = await attempt(ctx.fs.rmdir(abs), () => "ENOTEMPTY");
    return empty.result ?? ok("");
  }
  const walk = await attempt(ctx.removeTree(abs, { rootDev: ctx.rootDev, fs: ctx.fs }), (e) => (e?.code === "ECONFINE" ? "ECONFINE" : ctx.tag(e)));
  return walk.result ?? ok("");
}

/** O(1) — a bounded number of lstat/realpath calls, no listing. */
export async function doRename(ctx, params) {
  if (params.path === "" || params.to === "") return fail("ECONFINE");
  const [[sDir, sName], [dDir, dName]] = [splitParent(params.path), splitParent(params.to)];
  const src = await resolveInside(ctx, sDir, "ENOENT");
  if (src.result) return src.result;
  const sAbs = join(src.real, sName);
  const sSt = await attempt(ctx.fs.lstat(sAbs), ctx.tag);
  if (sSt.result) return sSt.result;
  if (sSt.value.isSymbolicLink()) {
    const linked = await resolveInside(ctx, params.path, "ECONFINE");
    if (linked.result) return linked.result;
  }
  const dst = await resolveInside(ctx, dDir, "ENOPARENT");
  if (dst.result) return dst.result;
  if (!dst.st.isDirectory()) return fail("ENOPARENT");
  const dAbs = join(dst.real, dName);
  const dSt = await attempt(ctx.fs.lstat(dAbs), ctx.tag);
  if (dSt.tag !== "ENOENT") {
    if (dSt.result) return dSt.result;
    if (params.overwrite !== true) return fail("EEXIST");
    if (sSt.value.isDirectory() || dSt.value.isDirectory()) return fail("EEXIST");
  }
  const moved = await attempt(ctx.fs.rename(sAbs, dAbs), ctx.tag);
  return moved.result ?? ok("");
}

/** One parent segment: absent means create it, a link means resolve it and demand a
 *  directory. The relative name is kept, not the resolved absolute: both spell it
 *  while the link is in place. O(1) — one lstat, plus realpath and stat for a link. */
async function ensureDir(ctx, rel) {
  const abs = join(ctx.rootReal, rel);
  const probe = await attempt(ctx.fs.lstat(abs), ctx.tag);
  if (probe.value === null) {
    if (probe.tag !== "ENOENT") return { result: probe.result };
    return attempt(ctx.fs.mkdir(abs), () => "EIO");
  }
  if (!probe.value.isSymbolicLink()) return { result: probe.value.isDirectory() ? null : fail("EIO") };
  const r = await resolveInside(ctx, rel, "ECONFINE");
  if (r.result) return { result: r.result };
  return { result: r.st.isDirectory() ? null : fail("EIO") };
}

/** O(1) — the mode a rewrite keeps, and whether the target may be written. */
async function targetMode(ctx, targetRel) {
  const probe = await attempt(ctx.fs.lstat(join(ctx.rootReal, targetRel)), ctx.tag);
  if (probe.value === null) return { mode: DEFAULT_MODE, result: probe.tag === "ENOENT" ? null : probe.result };
  if (probe.value.isDirectory()) return { mode: DEFAULT_MODE, result: fail("EISDIR") };
  if (!probe.value.isSymbolicLink()) return { mode: probe.value.mode & 0o7777, result: null };
  const r = await resolveInside(ctx, targetRel, "ECONFINE");
  if (r.result) return { mode: DEFAULT_MODE, result: r.result };
  if (r.st.isDirectory()) return { mode: DEFAULT_MODE, result: fail("EISDIR") };
  return { mode: r.st.isFile() ? r.st.mode & 0o7777 : DEFAULT_MODE, result: null };
}

/**
 * Stage the payload in a sibling temp file and rename it over the target. The chmod
 * rides the open handle, so the mode can never land on a swapped temp file.
 * O(b) in the payload size — one write, one rename, never a read-back.
 */
async function commit(ctx, job) {
  const opened = await attempt(ctx.fs.open(job.tmp, O_WX, job.mode), ctx.tag);
  if (opened.result) return opened.result;
  const fh = opened.value;
  try {
    await fh.writeFile(job.bytes);
    await fh.chmod(job.mode);
    await fh.close();
    await ctx.fs.rename(job.tmp, job.abs);
    return ok("");
  } catch {
    // the write failed, so unwind the handle and the temp file before answering
    await attempt(fh.close(), () => "EIO");
    await attempt(ctx.fs.unlink(job.tmp), () => "EIO");
    return fail("EIO");
  }
}

/** Write a workspace file atomically. O(d + b) — d segments walked, b bytes written. */
export async function doWrite(ctx, params) {
  if (params.path === "") return fail("ECONFINE");
  if (typeof params.contentBase64 !== "string") return fail("EIO");
  const [dirRel, final] = splitParent(params.path);
  let rel = "";
  if (dirRel !== "") {
    for (const seg of dirRel.split("/")) {
      rel = rel === "" ? seg : `${rel}/${seg}`;
      const r = await ensureDir(ctx, rel);
      if (r.result) return r.result;
    }
  }
  const target = await targetMode(ctx, join(rel, final));
  if (target.result) return target.result;
  const tmp = join(ctx.rootReal, rel, `${final}.vfstmp${randomBytes(8).toString("hex")}`);
  const job = { abs: join(ctx.rootReal, rel, final), tmp, mode: target.mode, bytes: Buffer.from(params.contentBase64, "base64") };
  return commit(ctx, job);
}
