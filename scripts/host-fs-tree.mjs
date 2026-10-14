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

/**
 * Remove a tree without following links and without crossing `st_dev`.
 * O(n) where n is the entry count — one lstat per entry, depth-first.
 * @param {string} absPath absolute path already confined to the root
 * @param {{ rootDev: number, fs: object }} opts device guard + injectable fs
 * @returns {Promise<void>} resolves when the tree is gone
 */
export async function removeTreeNoFollow(absPath, { rootDev, fs }) {
  const st = await fs.lstat(absPath);
  if (st.isSymbolicLink()) {
    await fs.unlink(absPath);
    return;
  }
  if (!st.isDirectory()) {
    await fs.unlink(absPath);
    return;
  }
  if (st.dev !== rootDev) {
    const err = new Error("cross-device tree");
    err.code = "ECONFINE";
    throw err;
  }
  const names = await fs.readdir(absPath);
  for (const name of names) {
    const entry = typeof name === "string" ? name : name.name;
    await removeTreeNoFollow(join(absPath, entry), { rootDev, fs });
  }
  await fs.rmdir(absPath);
}
