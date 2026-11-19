// Phase 3 "Save section": one container stored as a template page, marked so the
// slash menu lists it under "My sections".

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "@/entities/block/model/types";
import type { PageEntry } from "@/entities/page/model/types";
import { isSectionTemplate, sectionTemplateOf } from "@/store/templateCopy";
import { mySectionCommands } from "@/features/slash-commands/model/sectionSlashCommands";

const page = (extra: Partial<PageEntry>): PageEntry =>
  ({ _id: "p1", title: "Home", workspaceId: "ws", content: [], ...extra }) as PageEntry;
const container: Block = {
  id: "cl", type: "column_list", content: "", style: { layout: "grid", cols: 3 },
  children: [{ id: "c", type: "column", content: "", children: [{ id: "h", type: "heading_3", content: "Pricing" }] }],
};

test("a saved section is one container, named by its first heading and marked", () => {
  const saved = sectionTemplateOf(container);
  assert.equal(saved.title, "Pricing");
  assert.deepEqual(saved.content, [container]);
  assert.notEqual(saved.content[0], container);
  assert.equal(isSectionTemplate(page({ isTemplate: true, properties: saved.properties })), true);
  assert.equal(isSectionTemplate(page({ isTemplate: true })), false);
  assert.equal(sectionTemplateOf({ ...container, children: [] }).title, "Untitled section");
});

test("My sections lists the live section templates only", () => {
  const marker = sectionTemplateOf(container).properties;
  const commands = mySectionCommands([
    page({ _id: "s1", title: "Pricing", isTemplate: true, properties: marker }),
    page({ _id: "s2", title: "Old", isTemplate: true, properties: marker, archivedAt: "2026-11-01" }),
    page({ _id: "t1", title: "Plain template", isTemplate: true }),
    page({ _id: "p2", title: "A page", properties: marker }),
  ]);
  assert.deepEqual(commands.map((c) => [c.id, c.label, c.section, c.templatePageId]), [["my-section:s1", "Pricing", "my-sections", "s1"]]);
});
