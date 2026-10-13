/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundNames.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { sanitizeSegment } from "./idePaths";

/** An event path split into segments, or the reason it cannot be one. */
export type InboundPath = { segments: string[] } | { skip: string };

/**
 * The segments of one sandbox event path, or the skip that keeps it away from
 * every page. sanitizeSegment is the guard the writer names files with, so a
 * segment it would rewrite ("..", a control char, a separator) is refused here
 * instead of naming a page the app could never own. "." needs its own test:
 * sanitizeSegment folds only runs of two or more dots and hands "." back, but
 * "." is the directory itself (the writer maps a "." title to "untitled").
 *
 * The writer trims a page title's trailing dots before ".omd" (pagePaths
 * baseFor), so no page file is named "etc..omd". Ponytail: one written before
 * that trim stays in the sandbox (attach leaves sandbox-only files alone) and
 * every edit to it is a loud skip, never a wrong page; delete it by hand —
 * "etc.omd" is that page's file now.
 *
 * O(len(path)) — one split plus one sanitizeSegment per segment.
 */
export function inboundSegments(path: string): InboundPath {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const ownable = segments.length > 0 && segments.every((segment) => segment !== "." && sanitizeSegment(segment) === segment);
  return ownable ? { segments } : { skip: `"${path}" is not a valid name here` };
}

// vim (backup "~", swap ".name.swp"/".swo"/".swx", write probe "4913") and
// emacs (lock ".#name", autosave "#name#"): what the editors write next to the
// file being saved. A page CAN hold such a name (a code page titled "4913"),
// which is why the rows ask whether a page owns the path before going quiet.
const EDITOR_TEMPS: readonly RegExp[] = [/~$/, /^\..*\.sw[pox]$/, /^4913$/, /^\.#/, /^#.*#$/];

/**
 * True when a name is an editor's scratch file rather than workspace content.
 * O(len(name)) — five anchored regex tests, no allocation.
 *
 * Ponytail: a hand-made file that really is called "4913" or "x.omd~" and that
 * no page owns is dropped from the sync silently (quiet skip): it never syncs
 * into a page, and a loud warning on every save of such a file is worse than
 * the miss. A page owning the exact path is the one loud case.
 */
export function isEditorTempName(name: string): boolean {
  return EDITOR_TEMPS.some((pattern) => pattern.test(name));
}