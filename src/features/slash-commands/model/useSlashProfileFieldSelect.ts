/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSlashProfileFieldSelect.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback } from "react";

import type { Block } from "@/entities/block";
import { bound } from "@/data/templates/templateBlocks";
import type { SlashMenuState } from "@/features/block-editor/model/playgroundBlockEditor.helpers";
import { isReadmePage, PROFILE_FIELD_SETTINGS_EVENT } from "@/features/profile-binding/model/readmePage";

import { stripSlashQuery } from "./slashQueryText";

const DEFAULT_FIELD = "displayName";

interface ProfileFieldSelectInput {
  pageId: string;
  slashMenu: SlashMenuState | null;
  setSlashMenu: (menu: SlashMenuState | null) => void;
  updateBlock: (pageId: string, blockId: string, updates: Partial<Block>) => void;
  insertBlock: (pageId: string, afterBlockId: string, block: Block) => void;
  content: Block[];
  isReadme?: boolean;
}

function findBlock(blocks: Block[], id: string): Block | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    const inside = block.children ? findBlock(block.children, id) : null;
    if (inside) return inside;
  }
  return null;
}

function announce(blockId: string): void {
  if (typeof globalThis.dispatchEvent !== "function") return;
  globalThis.dispatchEvent(new CustomEvent(PROFILE_FIELD_SETTINGS_EVENT, { detail: { blockId } }));
}

/**
 * `/profile field`: bind the block the menu was opened on, or the next one when it holds
 * text. The README gate is re-checked here because the menu list is only a view: a stale
 * row must not bind anything on a page that is not the owner's README.
 */
export function selectProfileField(input: ProfileFieldSelectInput): void {
  const { pageId, slashMenu, setSlashMenu, updateBlock, insertBlock, content } = input;
  if (!slashMenu) return;
  if (!(input.isReadme ?? isReadmePage(pageId))) return;
  const { blockId } = slashMenu;
  setSlashMenu(null);
  const source = findBlock(content, blockId);
  if (!source) return;

  const rest = stripSlashQuery(source.content ?? "", slashMenu.anchor);
  if (rest.trim() === "") {
    const { recordRef, fieldBind } = bound(blockId, DEFAULT_FIELD);
    updateBlock(pageId, blockId, { content: "", placeholderText: undefined, recordRef, fieldBind });
    announce(blockId);
    return;
  }
  updateBlock(pageId, blockId, { content: rest, placeholderText: undefined });
  const next = bound(crypto.randomUUID(), DEFAULT_FIELD);
  insertBlock(pageId, blockId, next);
  announce(next.id);
}

export function useSlashProfileFieldSelect(options: Omit<ProfileFieldSelectInput, "content" | "isReadme"> & { getBlocks: () => Block[] }) {
  const { pageId, slashMenu, setSlashMenu, updateBlock, insertBlock, getBlocks } = options;
  return useCallback(
    () => selectProfileField({ pageId, slashMenu, setSlashMenu, updateBlock, insertBlock, content: getBlocks() }),
    [pageId, slashMenu, setSlashMenu, updateBlock, insertBlock, getBlocks],
  );
}
