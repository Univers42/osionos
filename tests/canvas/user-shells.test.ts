// Phase 3 "Save as shell": a copy of the page as a template page, the blocks copied
// again on each use. ADR 0065 CV15: cover and position only, never a cover-layout
// field; the page's properties stay out (a workspace template is in no database).

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "@/entities/page/model/types";
import { shellCopyOf } from "@/store/templateCopy";

const page = (extra: Partial<PageEntry>): PageEntry =>
  ({ _id: "p1", title: "Home", icon: "🏠", workspaceId: "ws", content: [{ id: "a", type: "paragraph", content: "Hi" }], ...extra }) as PageEntry;

test("a shell copy carries the blocks, title, icon and cover, and is a copy", () => {
  const source = page({ cover: "gradient:sunset", coverPosition: 40 });
  const copy = shellCopyOf(source);
  assert.deepEqual(copy, { title: "Home shell", icon: "🏠", content: source.content, cover: "gradient:sunset", coverPosition: 40 });
  assert.notEqual(copy?.content, source.content);
});

test("a shell copy never takes a cover-layout field or the page's properties", () => {
  const copy = shellCopyOf(page({ coverHeight: 300, coverWidth: "full", properties: [{ key: "k", label: "K", type: "text", value: "v" }] } as Partial<PageEntry>));
  assert.deepEqual(Object.keys(copy ?? {}).sort(), ["content", "icon", "title"]);
});

test("a page whose body is not loaded is not copied", () => {
  assert.equal(shellCopyOf(page({ content: undefined })), null);
});
