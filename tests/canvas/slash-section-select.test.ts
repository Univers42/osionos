// Choosing a section in the slash menu: the menu closes at once, the section's
// blocks load, and the page is replaced in ONE commit (one undo step), read after
// the load so an edit made while it loaded is kept.

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "@/entities/block/model/types";
import type { SlashMenuState } from "@/features/block-editor/model/playgroundBlockEditor.helpers";
import { selectSlashSection } from "@/features/slash-commands/model/useSlashSectionSelect";
import type { SlashSectionCommand } from "@/features/slash-commands/model/types";

const item = { kind: "section", id: "section:hero", label: "Hero", sectionId: "hero" } as SlashSectionCommand;
const menu = { blockId: "t", anchor: 6, filter: "hero", position: { x: 0, y: 0 } } as SlashMenuState;

function harness(content: Block[], loaded: Block[] | null) {
  const calls = { menu: [] as (SlashMenuState | null)[], commits: [] as Block[][], focus: [] as string[] };
  let current = content;
  const deps = {
    slashMenu: menu,
    setSlashMenu: (next: SlashMenuState | null) => calls.menu.push(next),
    getContent: () => current,
    commitContent: (next: Block[]) => calls.commits.push(next),
    focusBlock: (id: string) => calls.focus.push(id),
    loadBlocks: async () => loaded,
  };
  return { calls, deps, edit: (next: Block[]) => { current = next; } };
}

test("the section replaces the emptied trigger in one commit and takes the caret", async () => {
  const { calls, deps } = harness([{ id: "t", type: "paragraph", content: "/hero" }], [{ id: "h", type: "heading_1", content: "Big" }]);
  menu.anchor = 0;
  await selectSlashSection(item, deps);
  assert.deepEqual(calls.menu, [null]);
  assert.equal(calls.commits.length, 1);
  assert.deepEqual(calls.commits[0].map((block) => [block.type, block.content]), [["heading_1", "Big"]]);
  assert.deepEqual(calls.focus, [calls.commits[0][0].id]);
});

test("text before the slash stays, and an edit made during the load is kept", async () => {
  const { calls, deps, edit } = harness([{ id: "t", type: "paragraph", content: "Intro /hero" }], [{ id: "h", type: "heading_1", content: "Big" }]);
  menu.anchor = 6;
  const pending = selectSlashSection(item, deps);
  edit([{ id: "t", type: "paragraph", content: "Intro /hero" }, { id: "n", type: "paragraph", content: "typed meanwhile" }]);
  await pending;
  assert.deepEqual(calls.commits[0].map((block) => block.content), ["Intro ", "Big", "typed meanwhile"]);
});

test("an unknown section closes the menu and changes nothing", async () => {
  const { calls, deps } = harness([{ id: "t", type: "paragraph", content: "/x" }], null);
  await selectSlashSection(item, deps);
  assert.deepEqual(calls.menu, [null]);
  assert.equal(calls.commits.length, 0);
});

test("no open menu: nothing happens", async () => {
  const { calls, deps } = harness([], [{ id: "h", type: "heading_1", content: "Big" }]);
  await selectSlashSection(item, { ...deps, slashMenu: null });
  assert.equal(calls.menu.length + calls.commits.length, 0);
});
