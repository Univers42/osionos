/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-ancestor-chain.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { ancestorChain } from "../../src/entities/page/model/ancestorChain.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

function page(id: string, parentPageId: string | null): PageEntry {
  return { _id: id, workspaceId: "ws", title: id, parentPageId };
}

const ids = (chain: PageEntry[]) => chain.map((p) => p._id);

test("ancestor chain runs root first and ends on the page", () => {
  const pages = [page("home", null), page("citas", "home"), page("cubo", "citas")];
  assert.deepEqual(ids(ancestorChain(pages[2], pages)), ["home", "citas", "cubo"]);
  assert.deepEqual(ids(ancestorChain(pages[0], pages)), ["home"]);
});

test("ancestor chain stops at an unloaded parent and at a parentPageId cycle", () => {
  const orphan = page("orphan", "not-loaded");
  assert.deepEqual(ids(ancestorChain(orphan, [orphan])), ["orphan"]);
  const cycle = [page("x", "y"), page("y", "x")];
  assert.deepEqual(ids(ancestorChain(cycle[0], cycle)), ["y", "x"]);
});
