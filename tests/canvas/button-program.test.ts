/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   button-program.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseButtonProgram } from "@/entities/block/model/buttonProgram";
import type { ProgramStep } from "@/entities/block/model/buttonProgram";
import { runButtonProgram } from "@/services/button-program/interpreter";
import type { ProgramRunContext } from "@/services/button-program/interpreter";

const notify = (message: unknown = "hi"): ProgramStep =>
  ({ op: "action", action: { type: "notify", message } }) as ProgramStep;
const setProp = (property: string, value: unknown = 1): ProgramStep =>
  ({ op: "action", action: { type: "set_property", property, value } }) as ProgramStep;
const prog = (steps: ProgramStep[]) => ({ version: 1 as const, steps });
const bad = (input: unknown, path: string) => {
  const r = parseButtonProgram(input);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.path, path, r.error.message);
};

/* ── parser ── */
test("parser: a valid program round-trips; an empty program is valid", () => {
  const p = prog([
    { op: "set", name: "x", value: 2 },
    { op: "if", condition: { formula: "x > 1" }, steps: [notify()], else: [] },
    { op: "repeat", count: 3, steps: [notify()] },
    { op: "forEach", items: { formula: "items" }, as: "it", steps: [setProp("a", { formula: "it" } as never)] },
  ]);
  const r = parseButtonProgram(JSON.parse(JSON.stringify(p)));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.program, p);
  assert.ok(parseButtonProgram({ version: 1, steps: [] }).ok);
});

test("parser: structural errors name their path", () => {
  bad({ version: 1, steps: [{ op: "launch" }] }, "steps[0].op");
  bad({ version: 1, steps: [notify(), { op: "if", condition: true, steps: [{ op: "x" }] }] }, "steps[1].steps[0].op");
  bad({ version: 1, steps: [{ op: "if", condition: true }] }, "steps[0].steps");
  // `then` would make an if-step a thenable-looking object (Sonar S7739); the branch key is `steps`.
  bad({ version: 1, steps: [Object.fromEntries([["op", "if"], ["condition", true], ["then", [notify()]]])] }, "steps[0].then");
  bad({ version: 1, steps: [{ op: "repeat", count: [], steps: [] }] }, "steps[0].count");
  bad({ version: 1, steps: [{ op: "set", name: "x", value: 1, extra: 1 }] }, "steps[0].extra");
  bad({ version: 2, steps: [] }, "version");
  bad({ steps: [] }, "version");
  bad("nope", "");
  bad(null, "");
});

test("parser: limits", () => {
  bad(prog([{ op: "set", name: "x", value: { formula: "a".repeat(2001) } }]), "steps[0].value.formula");
  bad(prog([{ op: "set", name: "has space", value: 1 }]), "steps[0].name");
  bad(prog([{ op: "set", name: "n".repeat(65), value: 1 }]), "steps[0].name");
  bad(prog([{ op: "set", name: "x", value: "s".repeat(100_000) }]), "steps[0].value");
  bad(prog([notify("s".repeat(2001))]), "steps[0].action.message");
  bad(prog(Array.from({ length: 501 }, () => notify())), "steps");
  assert.ok(parseButtonProgram(prog(Array.from({ length: 500 }, () => notify()))).ok);
  const total = Array.from({ length: 40 }, () => notify("m".repeat(1900)));
  bad(prog(total), "");
});

function nested(depth: number): ProgramStep {
  let step: ProgramStep = notify();
  for (let i = 1; i < depth; i += 1) step = { op: "repeat", count: 1, steps: [step] };
  return step;
}

test("parser: depth 8 is accepted, depth 9 is rejected", () => {
  assert.ok(parseButtonProgram(prog([nested(8)])).ok);
  assert.equal(parseButtonProgram(prog([nested(9)])).ok, false);
});

test("parser: total — a 10^6-deep object returns ok:false and never throws", () => {
  let deep: Record<string, unknown> = { op: "action" };
  for (let i = 0; i < 1_000_000; i += 1) deep = { op: "repeat", count: 1, steps: [deep] };
  assert.equal(parseButtonProgram({ version: 1, steps: [deep] }).ok, false);
  let hostile: unknown = 1;
  for (let i = 0; i < 1_000_000; i += 1) hostile = { formula: hostile };
  assert.equal(parseButtonProgram({ version: 1, steps: [{ op: "set", name: "x", value: hostile }] }).ok, false);
});

/* ── interpreter ── */
const SENTINELS: Record<string, unknown> = { UNAVAIL: "#ENGINE_UNAVAILABLE", BUDGET: "#BUDGET_EXCEEDED" };
function harness(over: Partial<ProgramRunContext> = {}, props: Record<string, unknown> = {}) {
  const calls: unknown[] = [];
  let clock = 0;
  const ctx: ProgramRunContext = {
    props,
    evaluateFormula: (f, p) => (f in SENTINELS ? SENTINELS[f] : f === "true" ? true : f === "false" ? false : p[f]),
    runAction: async (action) => {
      calls.push(action);
      return { status: "ok" };
    },
    now: () => clock,
    ...over,
  };
  return { ctx, calls, tick: (ms: number) => (clock += ms) };
}
const run = (steps: ProgramStep[], over?: Partial<ProgramRunContext>, props?: Record<string, unknown>) => {
  const h = harness(over, props);
  return runButtonProgram(prog(steps), h.ctx).then((result) => ({ result, ...h }));
};

test("interpreter: set then if takes the right branch; a variable shadows a property", async () => {
  const { calls } = await run(
    [
      { op: "set", name: "x", value: 5 },
      { op: "if", condition: { formula: "x" }, steps: [notify("then")], else: [notify("else")] },
      { op: "if", condition: { formula: "false" }, steps: [notify("A")], else: [notify("B")] },
    ],
    undefined,
    { x: 0 },
  );
  assert.deepEqual(calls.map((c) => (c as { message: string }).message), ["then", "B"]);
});

test("interpreter: truthiness — false, 0, empty string, null are false; the string 'false' is true", async () => {
  for (const [value, branch] of [[false, "else"], [0, "else"], ["", "else"], [null, "else"], ["false", "then"], [1, "then"]] as const) {
    const { calls } = await run([{ op: "if", condition: { formula: "v" }, steps: [notify("then")], else: [notify("else")] }], undefined, { v: value });
    assert.equal((calls[0] as { message: string }).message, branch, String(value));
  }
});

test("interpreter: an if nested in a repeat; repeat 0 runs nothing; forEach binds and un-binds", async () => {
  const a = await run([{ op: "repeat", count: 3, steps: [{ op: "if", condition: true, steps: [notify()] }] }]);
  assert.equal(a.calls.length, 3);
  assert.equal((await run([{ op: "repeat", count: 0, steps: [notify()] }])).calls.length, 0);
  const b = await run(
    [
      { op: "forEach", items: { formula: "items" }, as: "it", steps: [notify({ formula: "it" } as never)] },
      notify({ formula: "it" } as never),
    ],
    undefined,
    { items: ["a", "b"], it: "outer" },
  );
  assert.deepEqual(b.calls.map((c) => (c as { message: unknown }).message), ["a", "b", "outer"]);
});

test("interpreter: forEach over a non-array is skipped and logged", async () => {
  const { result, calls } = await run([{ op: "forEach", items: { formula: "n" }, as: "i", steps: [notify()] }], undefined, { n: 4 });
  assert.equal(calls.length, 0);
  assert.equal(result.log[0].status, "skipped");
});

test("budget: forEach over 1500 items stops by iterations and counts the unvisited", async () => {
  const items = Array.from({ length: 1500 }, (_, i) => i);
  const { result, calls } = await run([{ op: "forEach", items: { formula: "items" }, as: "i", steps: [notify()] }], { limits: { maxNotifies: 5000 } }, { items });
  assert.ok(!result.ok && result.stoppedBy === "budget" && result.limit === "iterations");
  if (!result.ok) assert.equal(result.unvisited, 500);
  assert.equal(calls.length, 1000);
});

test("budget: steps — repeat 1000 { notify } costs 1001; 10 001 steps stops", async () => {
  const ok = await run([{ op: "repeat", count: 1000, steps: [notify()] }], { limits: { maxSteps: 1001, maxNotifies: 5000 } });
  assert.ok(ok.result.ok, "1001 steps fit a 1001 budget");
  const over = await run([{ op: "repeat", count: 1000, steps: [notify()] }], { limits: { maxSteps: 1000, maxNotifies: 5000 } });
  assert.ok(!over.result.ok && over.result.limit === "steps");
  assert.equal(over.calls.length, 999, "the step past the budget did not run");
  const big = await run(Array.from({ length: 10_001 }, () => ({ op: "set", name: "x", value: 1 }) as ProgramStep), { limits: { maxSteps: 10_000 } });
  assert.ok(!big.result.ok && big.result.limit === "steps");
});

test("budget: iterations — 1001 stops, nested empty loops stop", async () => {
  const one = await run([{ op: "repeat", count: 1001, steps: [notify()] }], { limits: { maxNotifies: 5000 } });
  assert.ok(!one.result.ok && one.result.limit === "iterations");
  assert.equal(one.calls.length, 1000);
  const nestedEmpty = await run([{ op: "repeat", count: 1000, steps: [{ op: "repeat", count: 1000, steps: [] }] }]);
  assert.ok(!nestedEmpty.result.ok && nestedEmpty.result.limit === "iterations");
  assert.ok((await run([{ op: "repeat", count: 1000, steps: [] }])).result.ok, "exactly 1000 iterations is allowed");
});

test("budget: side effects — the 51st set_property stops and does not run", async () => {
  const { result, calls } = await run(Array.from({ length: 51 }, () => setProp("a")));
  assert.ok(!result.ok && result.limit === "side_effects");
  assert.equal(calls.length, 50);
});

test("budget: 50 notifies plus a set_property still writes; a 51st notify stops", async () => {
  const { result, calls } = await run([...Array.from({ length: 50 }, () => notify()), setProp("a")]);
  assert.ok(result.ok);
  assert.equal(calls.length, 51);
  const over = await run(Array.from({ length: 51 }, () => notify()));
  assert.ok(!over.result.ok && over.result.limit === "notifies");
  assert.equal(over.calls.length, 50);
});

test("budget: wall time — a clock jump stops the run, even in an empty loop", async () => {
  const h = harness();
  h.ctx.runAction = async (a) => {
    h.calls.push(a);
    h.tick(41);
    return { status: "ok" };
  };
  const r = await runButtonProgram(prog(Array.from({ length: 50 }, () => setProp("a"))), h.ctx);
  assert.ok(!r.ok && r.limit === "wall_time");
  assert.equal(h.calls.length, 49, "writes that landed before the stop stay, none after");
  assert.equal(r.log.at(-1)?.status, "failed");
  const h2 = harness();
  let reads = 0;
  h2.ctx.now = () => (reads++ > 3 ? 2001 : 0);
  const loop = await runButtonProgram(prog([{ op: "repeat", count: 900, steps: [] }]), h2.ctx);
  assert.ok(!loop.ok && loop.limit === "wall_time");
});

test("sentinels: a condition sentinel is false and logged; a value sentinel fails the step", async () => {
  const c = await run([{ op: "if", condition: { formula: "UNAVAIL" }, steps: [notify("then")], else: [notify("else")] }]);
  assert.deepEqual(c.calls.map((x) => (x as { message: string }).message), ["else"]);
  assert.ok(c.result.log.some((e) => e.detail === "formula_unavailable"));
  const b = await run([{ op: "if", condition: { formula: "BUDGET" }, steps: [notify("then")] }]);
  assert.equal(b.calls.length, 0);
  assert.ok(b.result.log.some((e) => e.detail === "formula_budget_exceeded"));
  const v = await run([setProp("a", { formula: "BUDGET" }), notify({ formula: "UNAVAIL" })]);
  assert.equal(v.calls.length, 0, "the action handler was not called");
  assert.deepEqual(v.result.log.map((e) => e.status), ["failed", "failed"]);
});

test("log: ordered, the five statuses, capped at 200 with a truncated tail", async () => {
  const outcomes = ["ok", "failed", "blocked"] as const;
  let n = 0;
  const h = harness({ runAction: async () => ({ status: outcomes[n++ % 3] }) });
  const r = await runButtonProgram(prog([notify(), notify()]), h.ctx);
  assert.deepEqual(r.log.map((e) => e.status), ["ok", "failed"]);
  assert.ok(r.ok);
  const blocked = await run([notify(), notify()], { runAction: async () => ({ status: "blocked" }) });
  assert.ok(!blocked.result.ok && blocked.result.stoppedBy === "blocked");
  assert.equal(blocked.result.log.length, 1, "a refused write ends the run");
  const cancelled = await run([notify(), notify()], { runAction: async () => ({ status: "cancelled" }) });
  assert.ok(!cancelled.result.ok && cancelled.result.stoppedBy === "cancelled");
  assert.deepEqual(cancelled.result.log.map((e) => e.status), ["cancelled"]);
  const skipped = await run([{ op: "forEach", items: 1, as: "i", steps: [] }]);
  assert.equal(skipped.result.log[0].status, "skipped");
  const many = await run([{ op: "repeat", count: 500, steps: [notify()] }], { limits: { maxNotifies: 5000 } });
  assert.equal(many.result.log.length, 200);
  assert.equal(many.result.log[199].detail, "truncated");
  assert.equal(many.calls.length, 500, "the run goes on past the log cap");
});

test("import graph: the model and the interpreter value-import nothing; this test imports no engine", () => {
  // Both live in the database engine (lib/program), whose automations run the
  // same steps; the app paths re-export them. Still pure: the only import is
  // the interpreter's type import of the model, so no wasm bridge loads.
  const root = new URL("../../src/shared/notion-database-sys/src/lib/program/", import.meta.url);
  for (const file of ["buttonProgram.ts", "interpreter.ts"]) {
    const source = readFileSync(new URL(file, root), "utf8");
    assert.equal(/^import (?!type\b)/m.test(source), false, file);
    const imported = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    assert.deepEqual(imported.filter((specifier) => specifier !== "./buttonProgram"), [], file);
  }
  const self = readFileSync(new URL("../canvas/button-program.test.ts", import.meta.url), "utf8");
  assert.equal(/^import .*(notion-database-sys|bridge|api\/client)/m.test(self), false);
});
