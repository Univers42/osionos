/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   jsonKeyRange.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Where a key sits in the editor's text, so a problem found by parseThemeDoc
// (which reports a path, not an offset) is drawn under that key. A scanner and
// not a parser: it tracks only objects, arrays, keys and string boundaries.
// Caveat: exact on valid JSON only. On text that does not parse it can place a
// key one bracket off or return null; the editor then shows the problem on the
// first line instead, and Monaco's own syntax error marks the real place.

interface Frame {
  isObject: boolean;
  key: string | null;
  expectsKey: boolean;
}

/** The offset just past the string whose opening quote is at `quote`. */
function stringEnd(text: string, quote: number): number {
  for (let index = quote + 1; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === '"') return index + 1;
  }
  return text.length;
}

function decodeKey(raw: string): string {
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw.slice(1, -1);
  }
}

/** The offsets of the key string (quotes included) at `path`; null when the path is not in the text. */
export function findJsonKeyRange(text: string, path: readonly string[]): { start: number; end: number } | null {
  if (path.length === 0) return null;
  const stack: Frame[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      const end = stringEnd(text, index);
      const top = stack.at(-1);
      if (top?.isObject && top.expectsKey) {
        top.key = decodeKey(text.slice(index, end));
        top.expectsKey = false;
        if (stack.length === path.length && stack.every((frame, depth) => frame.key === path[depth])) return { start: index, end };
      }
      index = end;
      continue;
    }
    if (char === "{" || char === "[") stack.push({ isObject: char === "{", key: null, expectsKey: char === "{" });
    else if (char === "}" || char === "]") stack.pop();
    else if (char === ",") {
      const top = stack.at(-1);
      if (top?.isObject) top.expectsKey = true;
    }
    index += 1;
  }
  return null;
}
