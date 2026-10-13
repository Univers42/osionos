/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   active-page-metadata.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActivePage } from "@/entities/page";
import { patchActivePageSlice } from "@/store/activePageMetadata";

const entry = (id: string, title: string): ActivePage => ({ id, title, workspaceId: "ws", kind: "page" });

const STATE = {
  activePage: entry("a", "Old"),
  navigationPath: [entry("root", "Root"), entry("a", "Old")],
  recents: [entry("b", "B"), entry("a", "Old")],
};

test("patches the active page, its breadcrumb and its recents entry, nothing else", () => {
  const next = patchActivePageSlice(STATE, "a", { title: "New" });
  assert.equal(next.activePage?.title, "New");
  assert.deepEqual(next.navigationPath?.map((e) => e.title), ["Root", "New"]);
  assert.deepEqual(next.recents?.map((e) => e.title), ["B", "New"]);
  assert.equal(next.navigationPath?.[0], STATE.navigationPath[0], "untouched entries keep their identity");
  assert.equal(next.recents?.[0], STATE.recents[0]);
  assert.equal(STATE.activePage.title, "Old", "the input state is not mutated");
});

test("a page that is not active patches nothing (its breadcrumb is not on screen)", () => {
  assert.deepEqual(patchActivePageSlice(STATE, "b", { title: "Renamed" }), {});
  assert.deepEqual(patchActivePageSlice({ ...STATE, activePage: null }, "a", { title: "New" }), {});
});
