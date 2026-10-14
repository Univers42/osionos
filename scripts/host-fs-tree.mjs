/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   host-fs-tree.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { join } from "node:path";

// Recursive delete that never follows a link: lstat keeps a symlink as a
// link, so an escaping link is unlinked itself and never traversed. The dev
// check stops a mount-point crossing before anything under it is touched.

// Ponytail: the re-lstat after readdir narrows but cannot close the swap window
// (Node has no dirfd-relative unlink), it gets the *same path* wrong when the
// attacker rebinds that name between the two calls — it misses bind mounts,
// which share st_dev on one filesystem — and the desktop shell must route deletes
// through shell.trashItem (C23), never this walk.

/** O(1) — throw the one refusal this walk raises, with a code ops can map. */
function confine() {
  const err = new Error("tree changed under the walk");
  err.code = "ECONFINE";
  throw err;
}

/**
 * Prove the folder just read is still the one lstat described. A directory
 * swapped for a link between the two calls would otherwise be traversed.
 * O(1) — one lstat per directory, no listing.
 */
async function sameDir(ctx, absPath, first) {
  const now = await ctx.fs.lstat(absPath);
  if (now.isSymbolicLink() || !now.isDirectory()) confine();
  if (now.dev !== first.dev || now.ino !== first.ino) confine();
}

/**
 * Remove a tree without following links and without crossing `st_dev`.
 * O(n) where n is the entry count — one lstat per entry, depth-first.
 * @param {string} absPath absolute path already confined to the root
 * @param {{ rootDev: number, fs: object }} opts device guard + injectable fs
 * @returns {Promise<void>} resolves when the tree is gone
 */
export async function removeTreeNoFollow(absPath, { rootDev, fs }) {
  const ctx = { rootDev, fs };
  const st = await fs.lstat(absPath);
  if (st.isSymbolicLink()) {
    await fs.unlink(absPath);
    return;
  }
  if (!st.isDirectory()) {
    await fs.unlink(absPath);
    return;
  }
  if (st.dev !== rootDev) confine();
  const names = await fs.readdir(absPath);
  await sameDir(ctx, absPath, st);
  for (const name of names) {
    const entry = typeof name === "string" ? name : name.name;
    await removeTreeNoFollow(join(absPath, entry), ctx);
  }
  await fs.rmdir(absPath);
}
