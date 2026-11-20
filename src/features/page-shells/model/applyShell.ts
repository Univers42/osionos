// Fill an empty page with a shell from the catalogue in one commit, so a single
// undo returns the page to empty.

import { loadShell } from "@/data/templates/shells/shellIndex";
import type { Block } from "@/entities/block";
import { cloneBlock } from "@/features/block-editor/model/blockContextMenu.helpers";
import { firstLeafId } from "@/features/slash-commands/model/sectionInsert";
import { instantiateTemplateContent } from "@/store/pageStore.helpers";

export interface ShellTarget {
  /** Replace the page's blocks as one undo step. */
  commitContent: (blocks: Block[]) => void;
  focusBlock: (blockId: string) => void;
}

/** A template's blocks under fresh ids, so no page made from it shares the template's
 *  block ids (TD7). One source of fresh ids: apply and the shells both go through here. */
export function freshTemplateContent(blocks: Block[] | null | undefined): Block[] {
  return instantiateTemplateContent(blocks ?? undefined).map((block) => cloneBlock(block, true));
}

/** Fill the page with the blocks given, fresh ids each time; false when there are none. */
export function applyTemplateBlocks(blocks: Block[] | null, target: ShellTarget): boolean {
  const content = freshTemplateContent(blocks);
  if (content.length === 0) return false;
  target.commitContent(content);
  const caret = firstLeafId(content);
  if (caret) target.focusBlock(caret);
  return true;
}

export async function applyShell(shellId: string, target: ShellTarget): Promise<boolean> {
  return applyTemplateBlocks(await loadShell(shellId), target);
}
