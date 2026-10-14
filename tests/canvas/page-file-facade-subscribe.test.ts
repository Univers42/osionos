/* ************************************************************************** */
/*                                                                            */
/*                                             :::      ::::::::   */
/*   page-file-facade-subscribe.test.ts                       :+:      :+:    :+:   */
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
import { createFixtureStore } from "./page-file-facade-fixtures.ts";

test("page-file-facade: body edit leaves tables object identical and fires no subscribe", async () => {
  const store = createFixtureStore("ws");
  const page = await store.addPage({
    title: "Test.omd",
    parentId: null,
    surface: "page",
    content: [{ id: "b1", type: "paragraph", content: "original" }],
  });
  const facade = createPageFileFacade(store);

  let subscribeFired = false;
  const unsubscribe = facade.subscribe?.(() => { subscribeFired = true; });

  // A body edit must leave the tables object identical: same entry objects.
  const listBefore = facade.list();

  // Edit the page body
  await facade.writeContent(page._id, "# Updated\n\nNew content");

  const listAfter = facade.list();

  assert.equal(listAfter.length, listBefore.length);
  for (let i = 0; i < listBefore.length; i++) {
    assert.equal(listAfter[i], listBefore[i], `entry ${i} must be the same object after a body edit`);
  }
  // subscribe should not have fired
  assert.equal(subscribeFired, false, "subscribe should not fire on body edit");

  unsubscribe?.();
});

test("page-file-facade: retitle fires exactly one subscribe", async () => {
  const store = createFixtureStore("ws");
  const page = await store.addPage({ title: "Old.omd", parentId: null, surface: "page" });
  const facade = createPageFileFacade(store);

  let fireCount = 0;
  const unsubscribe = facade.subscribe?.(() => { fireCount++; });

  await facade.rename(page._id, "New.omd");

  assert.equal(fireCount, 1, "subscribe fires exactly once on retitle");

  unsubscribe?.();
});