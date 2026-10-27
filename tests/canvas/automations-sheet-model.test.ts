/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   automations-sheet-model.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The automations sheet's words and checks: a rule reads as one sentence, a
// draft says what is missing before it can be saved, and the templates are
// built from the database's own properties.

import assert from "node:assert/strict";
import test from "node:test";

import { ruleSentence } from "../../src/shared/notion-database-sys/src/components/automations/ruleSentence.ts";
import { blankRule, draftProblems } from "../../src/shared/notion-database-sys/src/components/automations/ruleDraft.ts";
import { ruleTemplates } from "../../src/shared/notion-database-sys/src/components/automations/ruleTemplates.ts";
import type { AutomationRuleV2, DatabaseSchema, ProgramStep } from "../../src/shared/notion-database-sys/src/types/database.ts";

const DB = {
  id: "tasks", name: "Tasks", titlePropertyId: "title",
  properties: {
    title: { id: "title", name: "Name", type: "title" },
    status: {
      id: "status", name: "Status", type: "status",
      options: [{ id: "s-todo", value: "To-do", color: "gray" }, { id: "s-doing", value: "Doing", color: "blue" }, { id: "s-done", value: "Done", color: "green" }],
      statusGroups: [
        { id: "todo", label: "To-do", color: "gray", optionIds: ["s-todo"] },
        { id: "progress", label: "In progress", color: "blue", optionIds: ["s-doing"] },
        { id: "complete", label: "Complete", color: "green", optionIds: ["s-done"] },
      ],
    },
    owner: { id: "owner", name: "Assignee", type: "person" },
    finished: { id: "finished", name: "Done at", type: "date" },
    score: { id: "score", name: "Score", type: "formula" },
  },
} as unknown as DatabaseSchema;

const act = (action: Extract<ProgramStep, { op: "action" }>["action"]): ProgramStep => ({ op: "action", action });

const ctx = { newId: () => "new-id", ownerId: "me", now: "2026-10-27T00:00:00.000Z" };

const draft = (patch: Partial<AutomationRuleV2>): AutomationRuleV2 => ({ ...blankRule(ctx), name: "Rule", ...patch });

test("a rule reads as one sentence: when, only if, do", () => {
  const rule = draft({
    trigger: { type: "property_changed", propertyId: "status", to: "s-done" },
    conditions: [{ id: "c", propertyId: "owner", operator: "is_not_empty", value: null }],
    program: { version: 1, steps: [act({ type: "set_property", property: "finished", value: { formula: "now()" } }), act({ type: "notify", message: "Done" })] },
  });
  assert.equal(ruleSentence(rule, DB.properties), "When Status changes to Done, if Assignee is not empty: set Done at, show a message");
});

test("every trigger has its words", () => {
  const say = (trigger: AutomationRuleV2["trigger"]) => ruleSentence(draft({ trigger }), DB.properties);
  assert.equal(say({ type: "row_added" }), "When a row is added: do nothing yet");
  assert.equal(say({ type: "row_deleted" }), "When a row is deleted: do nothing yet");
  assert.equal(say({ type: "property_changed" }), "When any property changes: do nothing yet");
  assert.equal(say({ type: "property_changed", propertyId: "status", from: "s-todo", to: "s-doing" }), "When Status changes from To-do to Doing: do nothing yet");
  assert.equal(say({ type: "property_changed", propertyId: "gone" }), "When a deleted property changes: do nothing yet");
});

test("a new rule starts empty, enabled and owned by its author", () => {
  const rule = blankRule(ctx);
  assert.equal(rule.version, 2);
  assert.equal(rule.id, "new-id");
  assert.equal(rule.enabled, true);
  assert.equal(rule.ownerId, "me");
  assert.deepEqual(rule.trigger, { type: "row_added" });
  assert.deepEqual(rule.program.steps, []);
});

test("a draft says what it lacks before it can be saved", () => {
  assert.deepEqual(draftProblems(draft({ name: " " }), DB.properties), ["Give the automation a name", "Add at least one action"]);
  const problems = draftProblems(draft({
    conditions: [{ id: "c", propertyId: "owner", operator: "equals", value: "" }],
    program: { version: 1, steps: [
      act({ type: "set_property", property: "", value: "x" }),
      act({ type: "set_property", property: "score", value: 1 }),
      act({ type: "webhook", url: "http://example.com" }),
      act({ type: "notify", message: "" }),
    ] },
  }), DB.properties);
  assert.deepEqual(problems, [
    "Finish the condition on Assignee",
    "Choose the property to set",
    "Score is computed and cannot be set",
    "A webhook needs an https:// address",
    "Write the message to show",
  ]);
  assert.deepEqual(draftProblems(draft({ program: { version: 1, steps: [act({ type: "notify", message: "hi" })] } }), DB.properties), []);
});

test("templates are built from the database's own properties", () => {
  const templates = ruleTemplates(DB, ctx);
  const stamp = templates.find((template) => template.id === "stamp-finish");
  assert.ok(stamp?.build);
  const rule = stamp.build();
  assert.deepEqual(rule.trigger, { type: "property_changed", propertyId: "status", to: "s-done" });
  assert.deepEqual(rule.program.steps, [act({ type: "set_property", property: "finished", value: { formula: "now()" } })]);
  const triage = templates.find((template) => template.id === "triage-new")?.build?.();
  assert.deepEqual(triage?.program.steps, [act({ type: "set_property", property: "status", value: "s-todo" })]);
  assert.ok(templates.find((template) => template.id === "log-deleted")?.build);
});

test("a template the database cannot support says why", () => {
  const plain = { ...DB, properties: { title: DB.properties.title } } as DatabaseSchema;
  const stamp = ruleTemplates(plain, ctx).find((template) => template.id === "stamp-finish");
  assert.equal(stamp?.build, undefined);
  assert.equal(stamp?.unavailable, "Needs a status and a date property");
});
