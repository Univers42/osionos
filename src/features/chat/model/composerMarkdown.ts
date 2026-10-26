/**
 * The composer's formatting shortcuts, as pure text edits.
 *
 * `wrapSelection` knows nothing of the DOM, so it is tested under node. The
 * composer applies the result through the textarea (see `textareaEdit`) so the
 * browser's undo stack keeps working.
 *
 * Caveat: unwrapping looks only at the characters next to the selection, so
 * `**a** b **c**` with `a** b **c` selected is read as wrapped. A selection
 * that cuts a marker pair in half wraps again instead of unwrapping.
 */

export type MarkdownMarker = "**" | "_" | "`" | "~~" | "link";

export interface SelectionEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** The placeholder a new link carries: selected, so typing replaces it. */
const LINK_URL = "url";

/** Ctrl/Cmd + key → marker. Shift+X is the strike-through, written `x`. */
export const SHORTCUT_MARKERS: Record<string, MarkdownMarker> = {
  b: "**",
  i: "_",
  e: "`",
  x: "~~",
  k: "link",
};

function wrapLink(value: string, start: number, end: number): SelectionEdit {
  const selected = value.slice(start, end);
  const whole = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(selected);
  if (whole) {
    const text = whole[1];
    return { value: value.slice(0, start) + text + value.slice(end), selectionStart: start, selectionEnd: start + text.length };
  }
  const insert = `[${selected}](${LINK_URL})`;
  const urlStart = start + selected.length + 3;
  return {
    value: value.slice(0, start) + insert + value.slice(end),
    selectionStart: urlStart,
    selectionEnd: urlStart + LINK_URL.length,
  };
}

/** Wraps [start, end) in the marker, or removes the marker when already there. */
export function wrapSelection(value: string, start: number, end: number, marker: MarkdownMarker): SelectionEdit {
  if (marker === "link") return wrapLink(value, start, end);
  const size = marker.length;
  const selected = value.slice(start, end);
  // Markers just outside the selection: "**[bold]**".
  if (value.slice(start - size, start) === marker && value.slice(end, end + size) === marker && start >= size) {
    return {
      value: value.slice(0, start - size) + selected + value.slice(end + size),
      selectionStart: start - size,
      selectionEnd: end - size,
    };
  }
  // Markers inside the selection: "[**bold**]".
  if (selected.length >= size * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(size, selected.length - size);
    return { value: value.slice(0, start) + inner + value.slice(end), selectionStart: start, selectionEnd: start + inner.length };
  }
  return {
    value: value.slice(0, start) + marker + selected + marker + value.slice(end),
    selectionStart: start + size,
    selectionEnd: end + size,
  };
}

/**
 * The smallest replacement that turns `before` into `after`: the range of
 * `before` to select, and the text to type over it. Typing only the difference
 * is what lets one undo step revert one shortcut.
 */
export function minimalReplacement(before: string, after: string): { from: number; to: number; text: string } {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from += 1;
  let tail = 0;
  while (
    tail < before.length - from &&
    tail < after.length - from &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) tail += 1;
  return { from, to: before.length - tail, text: after.slice(from, after.length - tail) };
}

const STRUCTURAL_LINE = /^\s*([-*+]\s|\d+[.)]\s|#{1,6}\s|>|\||```|-{3,}\s*$|={3,}\s*$)/;

/**
 * The engine joins the lines of a paragraph with a space, so "one\ntwo" would
 * read "one two". A message is typed line by line: two plain lines in a row
 * become two paragraphs, so the break survives. Lists, quotes, tables, headings
 * and fenced code are left alone.
 *
 * Caveat: a plain line that starts like markdown ("2024. was a year") is read
 * as structure and keeps the engine's joining; an indented continuation line is
 * treated as plain and is split off its paragraph.
 */
export function keepLineBreaks(markdown: string): string {
  const out: string[] = [];
  let fenced = false;
  let previousPlain = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const plain = !fenced && line.trim() !== "" && !STRUCTURAL_LINE.test(line);
    if (plain && previousPlain) out.push("");
    out.push(line);
    previousPlain = plain;
  }
  return out.join("\n");
}
