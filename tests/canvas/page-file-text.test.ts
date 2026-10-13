/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-text.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";
import { pageFileText } from "../../src/features/page-file/model/pageFileText.ts";

const page = (content: string): PageEntry => ({
  _id: "p1", title: "Roadmap", workspaceId: "ws", surface: "page", parentPageId: null, archivedAt: null,
  content: [{ id: "b1", type: "paragraph", content }],
});

test("pageFileText is pageToFile, for every page object", () => {
  const first = page("hello");
  assert.equal(pageFileText(first), pageToFile(first));
  assert.equal(pageFileText(first), pageFileText(first));
});

test("a replaced page object gets its own text; the old object keeps its own", () => {
  const before = page("hello");
  const after = { ...before, content: [{ id: "b1", type: "paragraph" as const, content: "world" }] };
  assert.match(pageFileText(before), /hello/);
  assert.match(pageFileText(after), /world/);
  assert.match(pageFileText(before), /hello/);
});
