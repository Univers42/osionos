// Slash "Sections": the menu closes at once, the section loads (the catalogue is a
// lazy chunk), and the page changes in one commit, so one undo takes it back out.

import { useCallback } from "react";

import { buildSection } from "@/data/templates/sections/sectionIndex";
import { findBlockInTree, type Block } from "@/entities/block";
import type { SlashMenuState } from "@/features/block-editor/model/playgroundBlockEditor.helpers";

import { firstLeafId, placeSection } from "./sectionInsert";
import { stripSlashQuery } from "./slashQueryText";
import type { SlashSectionCommand } from "./types";

export interface SectionSelectDeps {
  slashMenu: SlashMenuState | null;
  setSlashMenu: (menu: SlashMenuState | null) => void;
  /** The page as it is now, pending drafts included. */
  getContent: () => Block[];
  /** Replace the page's blocks as one undo step. */
  commitContent: (blocks: Block[]) => void;
  focusBlock: (blockId: string) => void;
  loadBlocks?: (item: SlashSectionCommand) => Promise<Block[] | null>;
}

const loadLibrarySection = (item: SlashSectionCommand) => buildSection(item.sectionId);

/** The content is read after the load, so an edit made while it loaded is kept. */
export async function selectSlashSection(item: SlashSectionCommand, deps: SectionSelectDeps): Promise<void> {
  const { slashMenu } = deps;
  if (!slashMenu) return;
  deps.setSlashMenu(null);
  const section = await (deps.loadBlocks ?? loadLibrarySection)(item);
  if (!section?.length) return;
  const content = deps.getContent();
  const trigger = findBlockInTree(content, slashMenu.blockId);
  const rest = stripSlashQuery(trigger?.content ?? "", slashMenu.anchor);
  const { content: next, placed } = placeSection(content, slashMenu.blockId, rest, section);
  deps.commitContent(next);
  const caret = firstLeafId(placed);
  if (caret) deps.focusBlock(caret);
}

export function useSlashSectionSelect(deps: SectionSelectDeps): (item: SlashSectionCommand) => void {
  const { slashMenu, setSlashMenu, getContent, commitContent, focusBlock, loadBlocks } = deps;
  return useCallback(
    (item: SlashSectionCommand) => {
      void selectSlashSection(item, { slashMenu, setSlashMenu, getContent, commitContent, focusBlock, loadBlocks });
    },
    [slashMenu, setSlashMenu, getContent, commitContent, focusBlock, loadBlocks],
  );
}
