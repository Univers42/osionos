/**
 * Which messages of a long thread are drawn.
 *
 * The last `PAGE` first; each click on "Show earlier messages" reveals `PAGE`
 * more. O(1): a slice start, no scan.
 */

/** The messages drawn first, and added per click. */
export const MESSAGE_PAGE = 60;

/** The index of the first drawn message, for a thread of `total` after `pages` clicks. */
export function windowStart(total: number, pages: number): number {
  return Math.max(0, total - MESSAGE_PAGE * (1 + Math.max(0, pages)));
}
