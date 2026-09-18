/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   read-only-persist.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/16 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/16 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { NotionState } from "@notion-db/object-database";
import { viewStateChanged } from "../../src/widgets/database-view/model/readOnlyPersist.ts";

// The Recents / Templates home carousels are read-only projections. The ObjectDatabase host
// calls persistState after EVERY store change — including the reload that persistState
// itself asks for. Asking for a reload unconditionally therefore re-rendered the home page
// forever (~100 forced re-renders a second, measured). Only a real edit may ask for one.
const liveState = (title = "Page A", size = "medium"): NotionState => ({
  databases: { recents: { id: "recents", name: "Recently visited", titlePropertyId: "t", properties: { t: { id: "t", name: "Name", type: "title" } } } },
  pages: { a: { id: "a", databaseId: "recents", properties: { t: title }, content: [], createdAt: "x", updatedAt: "x", createdBy: "You", lastEditedBy: "You" } },
  views: { g: { id: "g", databaseId: "recents", name: "Recently visited", type: "gallery", filters: [], sorts: [], visibleProperties: [], settings: { cardSize: size } } },
}) as unknown as NotionState;

test("a reload with the same content is not an edit", () => {
  assert.equal(viewStateChanged(liveState(), liveState()), false);
});

test("renaming a card in the view is an edit", () => {
  assert.equal(viewStateChanged(liveState("Renamed"), liveState()), true);
});

test("changing a view setting is an edit", () => {
  assert.equal(viewStateChanged(liveState("Page A", "large"), liveState()), true);
});

test("without a baseline there is nothing to discard", () => {
  assert.equal(viewStateChanged(liveState()), false);
});
