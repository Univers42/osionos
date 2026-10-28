/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variables-menu.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The `{{` menu's pure half: which text opens it (and in which mode), what a pick
// writes back, and which names a page is offered, in the order they would win.

import assert from "node:assert/strict";
import { test } from "node:test";

import { FILTER_SUGGESTIONS, rankSuggestions, variableSuggestions } from "@/features/variables/model/variableCatalog";
import { parseVariableDefinitions } from "@/features/variables/model/variableDefinitions";
import { resolveVariable } from "@/features/variables/model/variableResolver";
import { applyVariableInsert, matchVariableTrigger } from "@/features/variables/model/variableTrigger";

const layer = (env: object) => parseVariableDefinitions(JSON.stringify(env)).definitions;

test("trigger: an open {{ at the end opens name mode, a | switches to filter mode", () => {
  assert.deepEqual(matchVariableTrigger("Hi {{"), { start: 3, mode: "name", name: "", query: "" });
  assert.deepEqual(matchVariableTrigger("Hi {{ CL"), { start: 3, mode: "name", name: "CL", query: "CL" });
  assert.deepEqual(matchVariableTrigger("{{page.Du"), { start: 0, mode: "name", name: "page.Du", query: "page.Du" });
  assert.deepEqual(matchVariableTrigger("{{TODAY | "), { start: 0, mode: "filter", name: "TODAY", query: "" });
  assert.deepEqual(matchVariableTrigger('{{TODAY | add:"1d" | da'), { start: 0, mode: "filter", name: "TODAY", query: "da" });
});

test("trigger: closed, escaped, mid-argument or malformed text opens nothing", () => {
  for (const text of ["plain", "{{A}}", "{{A}} then", "\\{{A", "{{a b", '{{A | date:"', "{{ | x", "{{A\nB", `{{${"A".repeat(300)}`]) {
    assert.equal(matchVariableTrigger(text), null, text);
  }
  assert.equal(matchVariableTrigger("{{A}} and {{B")?.name, "B", "only the last {{ counts");
});

test("insert: a pick completes the name or appends the filter, and closes the braces", () => {
  assert.equal(applyVariableInsert("Hi {{CL", "CLIENT"), "Hi {{CLIENT}}");
  assert.equal(applyVariableInsert("Hi {{", "page.Status"), "Hi {{page.Status}}");
  assert.equal(applyVariableInsert("Due {{TODAY | re", "relative"), "Due {{TODAY | relative}}");
  assert.equal(applyVariableInsert('{{TODAY | add:"7d" |', 'date:"medium"'), '{{TODAY | add:"7d" | date:"medium"}}');
  assert.equal(applyVariableInsert("{{A}}", "B"), null);
});

test("catalog: innermost env first, a shadowed name once, then properties, then unshadowed built-ins", () => {
  const items = variableSuggestions({
    layers: [layer({ CLIENT: "Globex", NOW: "frozen" }), layer({ CLIENT: "Acme", VAT: 0.2 })],
    owners: [{ _id: "p1", title: "Project" } as never, null],
    pages: [
      { title: "Sprint", properties: [{ key: "status", label: "Status", type: "select", value: "Doing" }] },
      { title: "Project", properties: [{ key: "status", label: "Status", type: "select", value: "Open" }, { key: "k1", label: "Due date", type: "date", value: null }, { key: "k2", label: "Évaluation!", type: "text", value: null }] },
    ],
  });
  assert.deepEqual(items.map((i) => `${i.insert} ← ${i.source}`), [
    "CLIENT ← env.json · Project",
    "NOW ← env.json · Project",
    "VAT ← env.json",
    "page.Status ← property",
    "page.Due_date ← property · Project",
    "page.k2 ← property · Project",
    "TODAY ← built-in",
    "TIME ← built-in",
    "PAGE ← built-in",
  ]);
});

test("rank: prefix matches before substring matches, case-insensitive, capped", () => {
  const items = ["PAGE", "page.Status", "TODAY", "LAUNCH_DATE", "DATE"].map((insert) => ({ insert, source: "" }));
  assert.deepEqual(rankSuggestions(items, "da", 10).map((i) => i.insert), ["DATE", "TODAY", "LAUNCH_DATE"]);
  assert.deepEqual(rankSuggestions(items, "", 2).map((i) => i.insert), ["PAGE", "page.Status"]);
});

test("every suggested filter resolves on a value it suits", () => {
  const scope = {
    layers: [layer({ N: 4 })],
    pages: [],
    context: { locale: "en-US", numberLocale: "en-US", timeZone: "Europe/Paris", now: new Date("2026-10-28T14:05:09Z") },
    dateFormat: "relative",
  };
  for (const { insert } of FILTER_SUGGESTIONS) {
    const subject = insert.startsWith("number") ? "N" : "TODAY";
    const resolved = resolveVariable(`${subject} | ${insert}`, scope);
    assert.ok(resolved && !resolved.error, `${insert}: ${resolved?.error}`);
  }
});
