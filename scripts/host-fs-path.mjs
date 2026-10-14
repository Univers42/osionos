/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   host-fs-path.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure name rules for the host transport: the renderer shows collaborative
// content, so every workspace-relative path is treated as hostile and refused
// before any fs call. No fs access here, so the rules unit-test without disk.

/** Win32 device names, with or without an extension — the twin checks the
 *  segment part before its first dot, trailing spaces trimmed. */
export const WIN32_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)$/i;

/**
 * Decide whether a workspace-relative path may touch the disk.
 * O(s) where s is the number of segments — two linear passes, no backtracking.
 * @param {string} relPath workspace-relative `/`-separated path, `""` is root
 * @param {{ platform?: string, mutating?: boolean }} opts name rules + root rule
 * @returns {string|null} `ECONFINE`, `EUNSUP`, or null when allowed
 */
export function pathRefusal(relPath, opts = {}) {
  const platform = opts.platform ?? process.platform;
  const mutating = opts.mutating ?? false;
  if (typeof relPath !== "string") return "ECONFINE";
  if (/[\n\r\t\0]/.test(relPath)) return "EUNSUP";
  if (relPath.startsWith("/")) return "ECONFINE";
  if (platform === "win32") {
    if (/^[A-Za-z]:[\\/]/.test(relPath)) return "ECONFINE";
    if (relPath.startsWith("\\")) return "ECONFINE";
  }
  if (relPath === "") return mutating ? "ECONFINE" : null;
  const parts = platform === "win32" ? relPath.split(/[/\\]/) : relPath.split("/");
  for (const seg of parts) {
    if (seg === "" || seg === "." || seg === "..") return "ECONFINE";
  }
  if (platform !== "win32") return null;
  if (relPath.includes("\\")) return "EUNSUP";
  if (/[<>\"|?*]/.test(relPath)) return "EUNSUP";
  if (/[\x00-\x1f]/.test(relPath)) return "EUNSUP";
  for (const seg of parts) {
    if (seg.includes(":")) return "EUNSUP";
    if (seg.endsWith(".") || seg.endsWith(" ")) return "EUNSUP";
    const base = seg.split(".")[0].replace(/ +$/, "");
    if (WIN32_RESERVED.test(base)) return "EUNSUP";
  }
  return null;
}

/**
 * Containment on resolved absolutes: a sibling `<root>-evil` shares the byte
 * prefix but not `root + sep`, so the separator stops the classic prefix slip.
 * O(1) — one string compare, no fs access.
 * @param {string} rootReal resolved root from `realpath`
 * @param {string} candidateReal resolved candidate from `realpath`
 * @param {string} sep native path separator
 * @returns {boolean} true when candidate is the root or under it
 */
export function isInsideRoot(rootReal, candidateReal, sep = "/") {
  if (candidateReal === rootReal) return true;
  const mark = sep ?? "/";
  const prefix = rootReal.endsWith(mark) ? rootReal : rootReal + mark;
  return candidateReal.startsWith(prefix);
}
