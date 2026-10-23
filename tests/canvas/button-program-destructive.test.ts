/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   button-program-destructive.test.ts                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { DESTRUCTIVE_PAGE_ACTIONS, parseButtonProgram } from "@/entities/block/model/buttonProgram";
import type { ProgramStep } from "@/entities/block/model/buttonProgram";
import { guardDestructive, runButtonProgram } from "@/services/button-program/interpreter";
import type { ActionOutcome, ProgramRunContext, ResolvedAction } from "@/services/button-program/interpreter";
import { PAGE_ACTION_NAMES } from "@/services/page-actions";

const pageAction = (name: string): ProgramStep => ({ op: "action", action: { type: "page_action", name } });
const notify = (message: string): ProgramStep => ({ op: "action", action: { type: "notify", message } });
const setProp = (property: string): ProgramStep => ({ op: "action", action: { type: "set_property", property, value: 1 } });

function harness(answer: boolean, over: Partial<ProgramRunContext> = {}) {
  const asked: string[] = [];
  const ran: ResolvedAction[] = [];
  const ctx: ProgramRunContext = {
    props: {},
    evaluateFormula: (f, p) => (f === "true" ? true : f === "items" ? ["a", "b"] : p[f]),
    runAction: guardDestructive(async (action): Promise<ActionOutcome> => {
      ran.push(action);
      return { status: "ok" };
    }, async (name) => {
      asked.push(name);
      return answer;
    }, DESTRUCTIVE_PAGE_ACTIONS),
    now: () => 0,
    ...over,
  };
  return { ctx, asked, ran };
}
const run = (steps: ProgramStep[], answer: boolean) => {
  const h = harness(answer);
  return runButtonProgram({ version: 1, steps }, h.ctx).then((result) => ({ result, ...h }));
};

test("destructive set: total over PAGE_ACTION_NAMES, nothing extra", () => {
  assert.deepEqual(Object.keys(DESTRUCTIVE_PAGE_ACTIONS).sort(), [...PAGE_ACTION_NAMES].sort());
  assert.equal(DESTRUCTIVE_PAGE_ACTIONS.move_to_trash, true);
  assert.equal(DESTRUCTIVE_PAGE_ACTIONS.lock_page, true);
  assert.equal(DESTRUCTIVE_PAGE_ACTIONS.copy_link, false);
});

test("parser: page_action needs a name and nothing else", () => {
  assert.ok(parseButtonProgram({ version: 1, steps: [pageAction("copy_link")] }).ok);
  const noName = parseButtonProgram({ version: 1, steps: [{ op: "action", action: { type: "page_action" } }] });
  assert.equal(noName.ok, false);
  if (!noName.ok) assert.equal(noName.error.path, "steps[0].action.name");
  assert.equal(parseButtonProgram({ version: 1, steps: [{ op: "action", action: { type: "page_action", name: "x", extra: 1 } }] }).ok, false);
});

test("a destructive step asks first, naming the action, and runs once confirmed", async () => {
  const { result, asked, ran } = await run([pageAction("move_to_trash")], true);
  assert.deepEqual(asked, ["move_to_trash"]);
  assert.equal(ran.length, 1);
  assert.equal(result.ok, true);
});

test("refusing stops the run: nothing written, later steps skipped, log says cancelled", async () => {
  const { result, ran } = await run([notify("before"), pageAction("move_to_trash"), setProp("a"), notify("after")], false);
  assert.deepEqual(ran.map((a) => a.type), ["notify"]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.stoppedBy, "cancelled");
  assert.equal(result.log.at(-1)?.status, "cancelled");
});

test("a non-destructive page action never asks", async () => {
  const { asked, ran } = await run([pageAction("copy_link"), pageAction("present")], false);
  assert.deepEqual(asked, []);
  assert.equal(ran.length, 2);
});

test("a destructive step nested in if.then and in a for-each body still asks, every time", async () => {
  const { asked } = await run([
    { op: "if", condition: { formula: "true" }, then: [pageAction("lock_page")] },
    { op: "forEach", items: { formula: "items" }, as: "it", steps: [pageAction("move_to_trash")] },
  ], true);
  assert.deepEqual(asked, ["lock_page", "move_to_trash", "move_to_trash"]);
});

test("a page action counts as a side effect: the 51st stops the run", async () => {
  const { result } = await run(Array.from({ length: 51 }, () => pageAction("copy_link")), true);
  assert.equal(result.ok, false);
  if (!result.ok && result.stoppedBy === "budget") assert.equal(result.limit, "side_effects");
});

test("an unknown page action name is not asked about and reaches the runner to fail", async () => {
  const { asked, ran } = await run([pageAction("rm_rf")], false);
  assert.deepEqual(asked, []);
  assert.equal(ran.length, 1);
});
