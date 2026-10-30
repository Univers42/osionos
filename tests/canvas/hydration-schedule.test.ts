/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   hydration-schedule.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Boot reads the workspace on screen alone and first, then the rest two at a time, so the
// api client's six slots stay free for the page the user opens while the others load.

import assert from "node:assert/strict";
import test from "node:test";

const { hydrateActiveFirst } = await import("../../src/store/sync/hydrationSchedule.ts");

function recorder(failing = new Set<string>()) {
  const started: string[] = [];
  let running = 0;
  let peak = 0;
  const hydrate = async (id: string) => {
    started.push(id);
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    if (failing.has(id)) throw new Error(`offline ${id}`);
    return 1;
  };
  return { started, hydrate, peak: () => peak };
}

test("the active workspace is read alone, before any other", async () => {
  const run = recorder();
  await hydrateActiveFirst(["a", "b", "c", "active", "d"], "active", run.hydrate);
  assert.equal(run.started[0], "active");
  assert.deepEqual([...run.started].sort(), ["a", "active", "b", "c", "d"]);
});

test("the others never take more than two slots", async () => {
  const run = recorder();
  await hydrateActiveFirst(["a", "b", "c", "d", "e", "f"], "a", run.hydrate);
  assert.equal(run.peak(), 2);
});

test("a failed workspace does not stop the others, and only successes count", async () => {
  const run = recorder(new Set(["b", "active"]));
  const changed = await hydrateActiveFirst(["active", "b", "c", "d"], "active", run.hydrate);
  assert.equal(changed, 2);
  assert.equal(run.started.length, 4);
});

test("an unknown or empty active id reads every workspace", async () => {
  const run = recorder();
  assert.equal(await hydrateActiveFirst(["a", "b"], "", run.hydrate), 2);
  assert.equal(await hydrateActiveFirst(["a", "b"], "gone", run.hydrate), 2);
  assert.equal(await hydrateActiveFirst([], "a", run.hydrate), 0);
});
