import type { Block } from "@/entities/block";
import { stableStringify } from "./sync/mergePageContent.tree";

function findBlock(blocks: readonly Block[], blockId: string): Block | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    const nested = block.children ? findBlock(block.children, blockId) : null;
    if (nested) return nested;
  }
  return null;
}

/** The same text for the same value, as the server would hold it: sorted keys, and an
 *  `undefined` key dropped, because JSON never carries one back. */
function persistedForm(value: unknown): string {
  return value === undefined ? "undefined" : stableStringify(JSON.parse(JSON.stringify(value)));
}

/** True when `next` is what the page already holds, so saving it would write nothing new. */
export function persistedValueIsUnchanged(current: unknown, next: unknown): boolean {
  return persistedForm(current) === persistedForm(next);
}

/**
 * True when applying `updates` would leave the block as it is. Compared with sorted
 * keys, because a canvas re-announces its cells with the keys in another order. Without
 * this every such call was stamped as an edit and PATCHed, so viewing wrote pages (#262).
 * An unknown block answers false: what to do about it stays the store's decision.
 */
export function blockUpdateIsNoop(blocks: readonly Block[], blockId: string, updates: Partial<Block>): boolean {
  const block = findBlock(blocks, blockId);
  if (!block) return false;
  const current = block as unknown as Record<string, unknown>;
  return Object.entries(updates).every(([key, value]) => persistedValueIsUnchanged(current[key], value));
}
