/**
 * Pure geometry + target predicates for the page marquee (rubber-band select).
 * Extracted from BlockEditorSurface so the marquee hook and the keyboard
 * automation `when`-predicates share one definition of "is this a text-entry
 * target" / "is this an interactive element".
 */

export interface SelectionPoint {
  x: number;
  y: number;
}

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function createSelectionRect(start: SelectionPoint, end: SelectionPoint): SelectionRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function rectsIntersect(rect: SelectionRect, target: DOMRect): boolean {
  return !(
    rect.left + rect.width < target.left ||
    rect.left > target.right ||
    rect.top + rect.height < target.top ||
    rect.top > target.bottom
  );
}

/** Atomic/embed block types that render their own interactive, non-text content
 *  (databases, media, graph, tables, buttons, code/equation). A pointerdown
 *  inside one of these is an interaction with the embed — NOT the start of a
 *  page marquee. Every block wrapper carries `data-block-type` (BlockTree), so
 *  `closest('[data-block-type="…"]')` catches a press anywhere inside them; the
 *  marquee can still SWEEP OVER them (hit-test is unaffected), it just can't
 *  BEGIN on one. Keep in sync with the LEAF blocks in blockCategories.ts. */
export const EMBED_BLOCK_TYPES = [
  'database_inline',
  'database_full_page',
  'graph_view',
  'draw',
  'home_views',
  'table_block',
  'image',
  'video',
  'audio',
  'file',
  'button',
  'code',
  'equation',
] as const;

const INTERACTIVE_SELECTION_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'a',
  '[contenteditable="true"]',
  '[data-column-resize-handle]',
  '[data-layout-cell-handle]',
  '[data-table-handle]',
  // Databases also expose these (full-page variant may render outside the
  // normal block wrapper), so match them directly as belt-and-suspenders.
  '.osionos-database-block',
  '[data-database-id]',
  ...EMBED_BLOCK_TYPES.map((type) => `[data-block-type="${type}"]`),
].join(', ');

/** True for elements where a marquee drag must NOT begin (buttons, inputs,
 *  links, contenteditable text, resize/drag handles, and any interactive embed
 *  block — see EMBED_BLOCK_TYPES). A non-element target is treated as
 *  interactive (defensive: never hijack an unknown target). */
export function isInteractiveSelectionTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(target.closest(INTERACTIVE_SELECTION_SELECTOR));
}

/** Narrower than isInteractiveSelectionTarget: matches only text-entry surfaces
 *  (NOT buttons), so a focused drag-handle button never blocks Delete/Backspace
 *  and the keyboard dispatcher never intercepts a typed character. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}
