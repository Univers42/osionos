/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutPaletteCommands.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ">" commands for inserting catalogue sections, filling a blank page from a
// shell, and changing one selected column list's layout. The dependency seam
// keeps the command behaviour testable without stores or the UI toast stack.

import { buildSection, SECTIONS } from "@/data/templates/sections/sectionIndex";
import { loadShell, SHELLS } from "@/data/templates/shells/shellIndex";
import { findBlockInTree, type Block } from "@/entities/block";
import { cloneBlock } from "@/features/block-editor/model/blockContextMenu.helpers";
import { useBlockSelection } from "@/features/block-editor/model/blockSelectionStore";
import { useEditorCommandBus, type EditorHandle } from "@/features/block-editor/model/editorCommandBus";
import { applyLayoutChoice } from "@/features/block-editor/model/layoutInspector";
import { firstLeafId } from "@/features/slash-commands/model/sectionInsert";
import { isLayoutModesEnabled } from "@/shared/config/featureFlags";
import { useToastStore } from "@/shared/ui";
import type { PaletteCommand } from "@/widgets/top-bar/model/commands";
import { applyTemplateBlocks } from "./applyShell";

export interface PaletteDeps {
  activeEditor: () => EditorHandle | null;
  selection: () => { sourceKey: string | null; ids: readonly string[] };
  loadSection: (id: string) => Promise<Block[] | null>;
  loadShell: (id: string) => Promise<Block[] | null>;
  notify: (title: string) => void;
}

export type LayoutPreset = "row" | "stack" | "grid-2" | "grid-3" | "grid-4";

const LAYOUTS: readonly { preset: LayoutPreset; label: string }[] = [
  { preset: "row", label: "Layout: row" },
  { preset: "stack", label: "Layout: stack" },
  { preset: "grid-2", label: "Layout: grid 2 columns" },
  { preset: "grid-3", label: "Layout: grid 3 columns" },
  { preset: "grid-4", label: "Layout: grid 4 columns" },
];

export function liveDeps(): PaletteDeps {
  return {
    activeEditor: () => useEditorCommandBus.getState().active,
    selection: () => {
      const state = useBlockSelection.getState();
      return { sourceKey: state.activeSourceKey, ids: state.ids };
    },
    loadSection: buildSection,
    loadShell,
    notify: (title) => useToastStore.getState().push({ kind: "info", title }),
  };
}

function sectionCommands(deps: PaletteDeps): PaletteCommand[] {
  return SECTIONS.map((section) => ({
    id: `section.insert.${section.id}`,
    label: `Insert section: ${section.label}`,
    group: "Sections",
    keywords: ["section", ...section.aliases, section.description],
    run: () => void insertSection(section.id, deps),
  }));
}

function shellCommands(deps: PaletteDeps): PaletteCommand[] {
  return SHELLS.map((shell) => ({
    id: `shell.apply.${shell.id}`,
    label: `Apply shell: ${shell.title}`,
    group: "Shells",
    keywords: ["shell", "template", shell.description],
    run: () => void applyShellCommand(shell.id, deps),
  }));
}

function layoutCommands(deps: PaletteDeps): PaletteCommand[] {
  return LAYOUTS.map(({ preset, label }) => ({
    id: `layout.preset.${preset}`,
    label,
    group: "Layout",
    keywords: ["layout", "columns"],
    run: () => void applyLayoutPreset(preset, deps),
  }));
}

export function layoutPaletteCommands(
  deps: PaletteDeps = liveDeps(),
  enabled = isLayoutModesEnabled(),
): PaletteCommand[] {
  if (!enabled) return [];
  return [...sectionCommands(deps), ...shellCommands(deps), ...layoutCommands(deps)];
}

export async function insertSection(id: string, deps: PaletteDeps): Promise<boolean> {
  const active = deps.activeEditor();
  if (active?.kind !== "linear") {
    deps.notify("Open a page to insert a section");
    return false;
  }
  const section = await deps.loadSection(id);
  if (!section?.length) return false;
  const content = active.getContent();
  const fresh = section.map((block) => cloneBlock(block, true));
  active.updateContent(isBlankPage(content) ? fresh : [...content, ...fresh]);
  const caret = firstLeafId(fresh);
  if (caret) active.focusBlock(caret);
  return true;
}

export async function applyShellCommand(id: string, deps: PaletteDeps): Promise<boolean> {
  const active = deps.activeEditor();
  if (active?.kind !== "linear") {
    deps.notify("Open a page to apply a shell");
    return false;
  }
  const blocks = await deps.loadShell(id);
  if (!isBlankPage(active.getContent())) {
    deps.notify("Shells fill an empty page — insert a section instead");
    return false;
  }
  return applyTemplateBlocks(blocks, { commitContent: active.updateContent, focusBlock: active.focusBlock });
}

function refuseLayout(deps: PaletteDeps): false {
  deps.notify("Select one column list first");
  return false;
}

export function applyLayoutPreset(preset: LayoutPreset, deps: PaletteDeps): boolean {
  const active = deps.activeEditor();
  const selection = deps.selection();
  if (active?.kind !== "linear" || selection.sourceKey !== active.sourceKey || selection.ids.length !== 1) {
    return refuseLayout(deps);
  }
  const content = active.getContent();
  const id = selection.ids[0];
  if (findBlockInTree(content, id)?.type !== "column_list") return refuseLayout(deps);
  const columns = preset.startsWith("grid-") ? Number(preset.slice(5)) : null;
  let next = applyLayoutChoice(content, id, "layout", columns === null ? preset : "grid");
  if (columns !== null) next = applyLayoutChoice(next, id, "cols", columns);
  if (next === content) return false;
  active.updateContent(next);
  return true;
}

export function isBlankPage(blocks: readonly Block[]): boolean {
  return blocks.every((block) =>
    block.type === "paragraph" && (block.content ?? "") === "" && !block.children?.length,
  );
}
