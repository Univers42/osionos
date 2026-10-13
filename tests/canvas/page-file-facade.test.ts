/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-facade.test.ts                           :+:      :+:    :+:   */
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
import { facadeChildByName, facadeChildren, type PageFacade } from "../../src/features/ide/vfs/pageProvider.ts";
import { createFixtureStore, seed300PageTree } from "./page-file-facade-fixtures.ts";

/** What pageProvider falls back to for a facade without the fast paths. */
function withoutFastPaths(facade: PageFacade): PageFacade {
  return { ...facade, children: undefined, childByName: undefined };
}

test("page-file-facade: fast listing and by-name lookup equal the generic fallback on 300 pages", () => {
  const store = createFixtureStore("ws");
  seed300PageTree(store);
  const fast = createPageFileFacade(store);
  const fallback = withoutFastPaths(fast);

  const dirs: (string | null)[] = [null, ...fast.list().filter((e) => e.kind === "dir").map((e) => e.id)];
  assert.ok(dirs.length > 20, "the seeded tree must have real directories");
  let compared = 0;
  for (const dir of dirs) {
    const expected = facadeChildren(fallback, dir).map((e) => e.id);
    assert.deepEqual(facadeChildren(fast, dir).map((e) => e.id), expected, `listing order of ${String(dir)}`);
    for (const entry of facadeChildren(fallback, dir)) {
      const name = entry.name ?? fallback.toSegment(entry.title);
      assert.equal(facadeChildByName(fast, dir, name)?.id, facadeChildByName(fallback, dir, name)?.id, `lookup of ${name} in ${String(dir)}`);
      compared++;
    }
  }
  assert.ok(compared > 200, `only ${compared} lookups compared`);
});
