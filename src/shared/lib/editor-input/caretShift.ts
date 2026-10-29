/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caretShift.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Keeps a caret where the user left it when a focused block's visible text is rewritten
// under them (a pasted mention's hostname becoming the page title). Offsets are in
// plain-text characters, the unit inlineEditorSelection uses.
//
// Caveat: the changed region is found by common prefix/suffix, so two edits at once
// collapse into one region; a caret inside that region is left where it was, and a
// caret after it moves by the length difference.

interface Offsets {
  start: number;
  end: number;
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let length = 0;
  while (length < limit && a[length] === b[length]) length += 1;
  return length;
}

function commonSuffixLength(a: string, b: string, prefix: number): number {
  const limit = Math.min(a.length, b.length) - prefix;
  let length = 0;
  while (length < limit && a[a.length - 1 - length] === b[b.length - 1 - length]) length += 1;
  return length;
}

/** `offsets` moved by the length difference of every change that ends at or before them. */
export function shiftOffsetsForTextChange(
  offsets: Offsets,
  previousText: string,
  nextText: string,
): Offsets {
  if (previousText === nextText) return offsets;
  const prefix = commonPrefixLength(previousText, nextText);
  const suffix = commonSuffixLength(previousText, nextText, prefix);
  const changeEnd = previousText.length - suffix;
  const delta = nextText.length - previousText.length;
  const shift = (offset: number) => (offset >= changeEnd ? offset + delta : offset);
  return { start: shift(offsets.start), end: shift(offsets.end) };
}
