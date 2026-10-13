/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-plan-code-moves.test.ts                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Q2: code files carry no id, so inside a renamed directory the only proof that
// `lib/main.ts` IS `src/main.ts` is the pending deleted `src`, the same tail, and
// the ledger's hash for the old path equal to the event's.

import assert from "node:assert/strict";
import test from "node:test";

import { cancel, deletedDir, drop, expectPlan, move, pageText, record, replay, schedule, viewOf, write } from "./fixtures/inboundFakeView.ts";
import type { FakeView } from "./fixtures/inboundFakeView.ts";
import type { InboundStep } from "../../src/features/ide/model/inboundPlan.ts";

const page = (id: string, path: string, parentId?: string) => ({ id, path, parentId, text: pageText(id), synced: `h-${path}` });
const folder = (id: string, path: string, parentId?: string) => ({ ...page(id, path, parentId), folder: true, synced: `h-${path}/_folder.omd` });
const code = (id: string, path: string, parentId?: string) => ({ id, path, parentId, code: true, text: `code ${id}`, synced: `h-${path}` });
const codeCopy = (path: string, hash: string, text: string): InboundStep => ({ op: "create", path, text, hash, kind: "code" });
const where = (view: FakeView) => view.table.pages.map((row) => `${row.pageId}@${row.path}`);
const orderings = <T>(items: readonly T[]): T[][] => (items.length <= 1 ? [[...items]]
  : items.flatMap((item, at) => orderings(items.filter((_, other) => other !== at)).map((rest) => [item, ...rest])));

const src = [folder("F", "src"), page("a", "src/a.omd", "F"), code("m", "src/main.ts", "F"),
  folder("U", "src/util", "F"), code("s", "src/util/strings.ts", "U")];
/** The file each write of `mv src lib` carries: the text the app wrote, under the hash the ledger holds at src/. */
const files: Record<string, { text: string; hash: string }> = {
  "_folder.omd": { text: pageText("F"), hash: "h-src/_folder.omd" },
  "a.omd": { text: pageText("a"), hash: "h-src/a.omd" },
  "main.ts": { text: "code m", hash: "h-src/main.ts" },
  "util/_folder.omd": { text: pageText("U"), hash: "h-src/util/_folder.omd" },
  "util/strings.ts": { text: "code s", hash: "h-src/util/strings.ts" },
};

test("Q2: mv src lib — all 120 orders of mixed .omd and code writes move the folder once; zero create, every id kept", async () => {
  const orders = orderings(Object.keys(files));
  assert.equal(orders.length, 120);
  for (const order of orders) {
    const view = viewOf(src);
    const writes = order.map((tail) => write(`lib/${tail}`, files[tail].hash, files[tail].text));
    assert.deepStrictEqual(await replay(view, [drop("src"), ...writes]), [[deletedDir("src", "folder-dir", "F"), schedule("F", "src")],
      [cancel("F"), move("F", "src", "lib", true), record(`lib/${order[0]}`, files[order[0]].hash)],
      ...order.slice(1).map((tail) => [record(`lib/${tail}`, files[tail].hash)])], order.join(" "));
    assert.deepStrictEqual(where(view), ["F@lib", "a@lib/a.omd", "m@lib/main.ts", "U@lib/util", "s@lib/util/strings.ts"], order.join(" "));
    assert.deepStrictEqual(view.table.pending, new Set(), order.join(" "));
  }
});

test("Q2 Ponytail: a code file edited inside the move window (hash differs) is created, never moved", async () => {
  const view = viewOf(src);
  await replay(view, [drop("src")]);
  await expectPlan(view, write("lib/main.ts", "h-edited", "code m, edited"), [codeCopy("lib/main.ts", "h-edited", "code m, edited")]);
});

test("Q2: the longest matching tail wins — A/util/strings.ts, not B/strings.ts with the same text", async () => {
  const view = viewOf([folder("A", "A"), folder("U", "A/util", "A"), code("s1", "A/util/strings.ts", "U"),
    folder("B", "B"), code("s2", "B/strings.ts", "B")]);
  view.table.ledger.set("B/strings.ts", "h-same");
  view.table.ledger.set("A/util/strings.ts", "h-same");
  await replay(view, [drop("A"), drop("B")]);
  await expectPlan(view, write("X/util/strings.ts", "h-same", "code s1"),
    [cancel("A"), move("A", "A", "X", true), record("X/util/strings.ts", "h-same")]);
});

test("Q2 + A8: a code page the user may not delete is never moved — its file under the new name is a code copy, byte for byte", async () => {
  const view = viewOf([folder("F", "src"), { ...code("m", "src/main.ts", "F"), canDelete: false as const }]);
  await replay(view, [drop("src")]);
  await expectPlan(view, write("lib/main.ts", "h-src/main.ts", "code m"), [codeCopy("lib/main.ts", "h-src/main.ts", "code m")]);
});
