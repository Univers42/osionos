/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-palette-commands.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Palette commands for sections, shells and column-list layouts. Every editor,
// loader and notification is fake: liveDeps is deliberately never evaluated.

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import type { Block } from "@/entities/block";
import type { EditorHandle } from "@/features/block-editor/model/editorCommandBus";
import type { PaletteDeps } from "@/features/page-shells/model/layoutPaletteCommands";

const STUBS = new Map<string, string>([
  ["@/shared/ui", "export const useToastStore = { getState: () => ({ push: () => undefined }) };"],
  ["@/shared/config/featureFlags", "export const isLayoutModesEnabled = () => false;"],
  ["@/store/pageStore.helpers", "export const instantiateTemplateContent = (blocks) => blocks ?? [];"],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/entities/block") return nextResolve("@/entities/block/model/blockTreeUtils", context);
    const stub = STUBS.get(specifier);
    if (stub !== undefined) return { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { applyLayoutPreset, applyShellCommand, insertSection, isBlankPage, layoutPaletteCommands } =
  await import("@/features/page-shells/model/layoutPaletteCommands");
const { SECTIONS } = await import("@/data/templates/sections/sectionIndex");
const { SHELLS } = await import("@/data/templates/catalogue/shells/shellIndex");
const { applyLayoutChoice } = await import("@/features/block-editor/model/layoutInspector");

const paragraph = (id: string, content = ""): Block => ({ id, type: "paragraph", content });
const columnList = (style?: Block["style"]): Block => ({
  id: "list", type: "column_list", content: "", style,
  children: [{ id: "column", type: "column", content: "", children: [paragraph("leaf")] }],
});
const sectionBlocks = (): Block[] => [{
  id: "fixture-section", type: "column_list", content: "",
  children: [{ id: "fixture-column", type: "column", content: "", children: [paragraph("fixture-leaf", "Hello")] }],
}];

function fake(content: Block[] = [], active = true) {
  const state: {
    content: Block[];
    selection: { sourceKey: string | null; ids: readonly string[] };
    section: Block[] | null;
    shell: Block[] | null;
  } = {
    content,
    selection: { sourceKey: "page:test", ids: [] },
    section: sectionBlocks(),
    shell: [paragraph("shell")],
  };
  const commits: Block[][] = [];
  const focus: string[] = [];
  const notices: string[] = [];
  const loads = { section: 0, shell: 0 };
  const editor: EditorHandle = {
    sourceKey: "page:test", pageId: "test", kind: "linear",
    getContent: () => state.content,
    updateContent: (blocks) => { commits.push(blocks); },
    focusBlock: (id) => { focus.push(id); },
    undo: () => undefined, redo: () => undefined,
    canUndo: () => false, canRedo: () => false, selectAll: () => undefined,
  };
  const deps: PaletteDeps = {
    activeEditor: () => active ? editor : null,
    selection: () => state.selection,
    loadSection: async () => { loads.section += 1; return state.section; },
    loadShell: async () => { loads.shell += 1; return state.shell; },
    notify: (title) => { notices.push(title); },
  };
  return { state, editor, deps, commits, focus, notices, loads };
}

test("the flag gates the full, uniquely identified command registry", () => {
  const h = fake();
  assert.deepEqual(layoutPaletteCommands(h.deps, false), []);
  const commands = layoutPaletteCommands(h.deps, true);
  assert.equal(commands.length, SECTIONS.length + SHELLS.length + 5);
  assert.equal(new Set(commands.map((command) => command.id)).size, commands.length);
  const labels = commands.map((command) => command.label);
  assert.ok(labels.includes("Insert section: Hero"));
  assert.ok(labels.includes("Apply shell: Landing page"));
  assert.ok(labels.includes("Layout: grid 3 columns"));
});

test("insertSection replaces a blank page with fresh blocks and focuses the first leaf", async () => {
  const h = fake([paragraph("empty")]);
  assert.equal(await insertSection("fixture", h.deps), true);
  assert.equal(h.commits.length, 1);
  const committed = h.commits[0];
  assert.equal(committed.length, sectionBlocks().length);
  assert.notEqual(committed[0].id, "fixture-section");
  const leaf = committed[0].children?.[0].children?.[0];
  assert.ok(leaf);
  assert.notEqual(leaf.id, "fixture-leaf");
  assert.deepEqual(h.focus, [leaf.id]);
});

test("insertSection appends after existing text without replacing its blocks", async () => {
  const original = [paragraph("old-a", "A"), paragraph("old-b", "B")];
  const h = fake(original);
  assert.equal(await insertSection("fixture", h.deps), true);
  assert.equal(h.commits.length, 1);
  assert.deepEqual(h.commits[0].slice(0, 2).map((block) => block.id), ["old-a", "old-b"]);
  assert.equal(h.commits[0][0], original[0]);
  assert.equal(h.commits[0][1], original[1]);
  assert.equal(h.commits[0].length, 3);
});

test("insertSection refuses a missing or non-linear editor before loading", async () => {
  const h = fake([], false);
  assert.equal(await insertSection("fixture", h.deps), false);
  const canvas = fake();
  canvas.editor.kind = "canvas";
  assert.equal(await insertSection("fixture", canvas.deps), false);
  for (const current of [h, canvas]) {
    assert.equal(current.commits.length, 0);
    assert.equal(current.loads.section, 0);
    assert.deepEqual(current.notices, ["Open a page to insert a section"]);
  }
});

test("insertSection reads content again after the section loader resolves", async () => {
  const h = fake([paragraph("old", "old")]);
  const newer = [paragraph("new", "new")];
  const load = h.deps.loadSection;
  h.deps.loadSection = async (id) => {
    const loaded = await load(id);
    h.state.content = newer;
    return loaded;
  };
  assert.equal(await insertSection("fixture", h.deps), true);
  assert.equal(h.commits[0][0], newer[0]);
  assert.equal(h.commits[0].some((block) => block.id === "old"), false);
});

test("insertSection commits nothing when the loader has no section", async () => {
  const h = fake();
  h.state.section = null;
  assert.equal(await insertSection("missing", h.deps), false);
  assert.equal(h.commits.length, 0);
});

test("applyShellCommand fills only a blank page", async () => {
  const blank = fake([paragraph("empty")]);
  assert.equal(await applyShellCommand("fixture", blank.deps), true);
  assert.equal(blank.commits.length, 1);
  const occupied = fake([paragraph("text", "Keep me")]);
  assert.equal(await applyShellCommand("fixture", occupied.deps), false);
  assert.equal(occupied.commits.length, 0);
  assert.deepEqual(occupied.notices, ["Shells fill an empty page — insert a section instead"]);
});

test("applyLayoutPreset writes grid layout and its column count in one commit", () => {
  const h = fake([columnList()]);
  h.state.selection = { sourceKey: "page:test", ids: ["list"] };
  assert.equal(applyLayoutPreset("grid-3", h.deps), true);
  assert.equal(h.commits.length, 1);
  const style = (h.commits[0][0] as any).style;
  assert.equal(style.layout, "grid");
  assert.equal(style.cols, 3);
});

test("applyLayoutPreset rejects every selection that is not one local column list", () => {
  const h = fake([columnList(), paragraph("p")]);
  const selections = [
    { sourceKey: "page:test", ids: [] },
    { sourceKey: "page:test", ids: ["list", "p"] },
    { sourceKey: "page:test", ids: ["p"] },
    { sourceKey: "other", ids: ["list"] },
  ];
  for (const selection of selections) {
    h.state.selection = selection;
    assert.equal(applyLayoutPreset("row", h.deps), false);
  }
  assert.equal(h.commits.length, 0);
  assert.deepEqual(h.notices, selections.map(() => "Select one column list first"));
});

test("applyLayoutPreset follows applyLayoutChoice identity for an unchanged row", () => {
  const content = [columnList({ layout: "row" })];
  const h = fake(content);
  h.state.selection = { sourceKey: "page:test", ids: ["list"] };
  const next = applyLayoutChoice(content, "list", "layout", "row");
  assert.equal(applyLayoutPreset("row", h.deps), next !== content);
  assert.equal(h.commits.length, next === content ? 0 : 1);
});

test("isBlankPage accepts only childless empty paragraphs", () => {
  assert.equal(isBlankPage([]), true);
  assert.equal(isBlankPage([paragraph("empty")]), true);
  assert.equal(isBlankPage([{ id: "missing", type: "paragraph" } as Block]), true);
  assert.equal(isBlankPage([paragraph("text", "x")]), false);
  assert.equal(isBlankPage([{ id: "heading", type: "heading_1", content: "" }]), false);
  assert.equal(isBlankPage([{ ...paragraph("parent"), children: [paragraph("child")] }]), false);
});

test("TopBar isolates both lazy command factory failures", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../src/widgets/top-bar/model/usePaletteSources.ts", import.meta.url), "utf8");
  assert.ok(source.includes('import("@/features/settings/model/settingsCommands").then((module) => module.settingsPaletteCommands())'));
  assert.ok(source.includes('import("@/features/page-shells/model/layoutPaletteCommands").then((module) => module.layoutPaletteCommands())'));
});
