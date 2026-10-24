/**
 * The only place that locates a slash query inside block text.
 *
 * A query starts at an anchor (the index of the "/" that opened the menu) and
 * runs to the end of the text: a command argument may itself contain "/"
 * ("/whiteboard Q3/Q4 plan"), so the last slash is not the query start.
 *
 * Caveat: the anchor is an index, so it cannot tell "the slash I opened on"
 * from another "/" that an edit before it happens to move into the same slot.
 * That rare case filters on the new text after that slash; any other edit
 * before the anchor shifts it off a "/" and `isAnchorValid` closes the menu.
 */

export function isAnchorValid(text: string, anchor: number): boolean {
  return Number.isInteger(anchor) && anchor >= 0 && anchor < text.length && text[anchor] === "/";
}

/** Text after the anchor slash, or null when the anchor no longer points at "/". */
export function filterFromText(text: string, anchor: number): string | null {
  return isAnchorValid(text, anchor) ? text.slice(anchor + 1) : null;
}

/** Anchor for a menu opened without a typed "/": the last slash present now, or -1. */
export function pinAnchor(text: string): number {
  return text.lastIndexOf("/");
}

/**
 * Remove the query (anchor slash to end of text). The anchor is measured on the
 * live editor text; the stored content it is applied to can lag a commit behind,
 * so an anchor that does not land on "/" there falls back to the last "/" — the
 * behaviour before anchors existed, never worse than it.
 */
export function stripSlashQuery(content: string, anchor?: number): string {
  if (anchor !== undefined && isAnchorValid(content, anchor)) return content.slice(0, anchor);
  const slashIdx = pinAnchor(content);
  return slashIdx >= 0 ? content.slice(0, slashIdx) : content;
}
