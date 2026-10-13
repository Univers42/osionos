/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-pin.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";
import { createPageFileFacade } from "../../src/features/page-file/model/pageFileFacade.ts";
import { pinFilePatch } from "../../src/features/page-file/model/pinFilePatch.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { createFixtureStore, page } from "./page-file-facade-fixtures.ts";

const HOSTILE = { title: "Hacked", surface: "folder", visibility: "public", icon: "🔥" } as const;

/** The page's own file text with these front-matter keys replaced (one `key: <JSON>` per line). */
function withMeta(text: string, meta: Record<string, string>): string {
  const keys = new Set(Object.keys(meta));
  const kept = text.split("\n").filter((line) => !keys.has(line.slice(0, line.indexOf(":"))));
  const added = Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return [kept[0], ...added, ...kept.slice(1)].join("\n");
}

async function writeHostile(canChangeSharing: boolean): Promise<PageEntry> {
  const store = createFixtureStore("ws");
  store._seed([page("p1", "Doc", null, "page", [{ id: "b1", type: "paragraph", content: "body" }])]);
  const facade = createPageFileFacade({ ...store, canChangeSharing: () => canChangeSharing });
  const text = await facade.readContent("p1");
  assert.ok(text.startsWith("---\n"), "a block page file opens with front matter");

  await facade.writeContent("p1", withMeta(text, HOSTILE));
  const written = store.pages().find((p) => p._id === "p1");
  assert.ok(written);
  return written;
}

test("pinFilePatch drops title and surface, keeps visibility only for the owner, never mutates", () => {
  const patch: Partial<PageEntry> = { title: "t", surface: "folder", visibility: "public", icon: "i" };

  assert.deepEqual(pinFilePatch(patch, false), { icon: "i" });
  assert.deepEqual(pinFilePatch(patch, true), { visibility: "public", icon: "i" });
  assert.deepEqual(patch, { title: "t", surface: "folder", visibility: "public", icon: "i" });
});

test("a non-owner's page file cannot rename, re-surface or publish the page", async () => {
  const written = await writeHostile(false);

  assert.equal(written.title, "Doc");
  assert.equal(written.surface, "page");
  assert.equal(written.visibility, undefined, "who sees the page is the owner's call");
  assert.equal(written.icon, "🔥", "the rest of the front matter still applies");
});

test("the owner's page file changes visibility, but never the title or the surface", async () => {
  const written = await writeHostile(true);

  assert.equal(written.visibility, "public");
  assert.equal(written.title, "Doc");
  assert.equal(written.surface, "page");
});
