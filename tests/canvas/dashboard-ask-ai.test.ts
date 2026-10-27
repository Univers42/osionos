/**
 * "Ask AI" from a dashboard widget (h2-ask-everywhere, C419-C428): the text a
 * widget hands over is what it shows, ids stay out, the quote is capped, and
 * the adapter exists only with the AI service.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import {
  SNAPSHOT_MAX_PROPERTIES, SNAPSHOT_MAX_RECORDS, snapshotValue, widgetSnapshot,
} from "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model/widgetSnapshot.ts";
import type { SchemaProperty } from "../../src/shared/notion-database-sys/src/types/database.ts";
import { quoteForAssistant, useAssistantHandoff } from "@/features/chat/model/assistantHandoff";
import { dashboardAskAI } from "@/widgets/database-view/model/dashboardAskAi";

const properties: Record<string, SchemaProperty> = {
  name: { id: "name", name: "Name", type: "title" },
  stage: { id: "stage", name: "Stage", type: "select", options: [{ id: "s1", value: "Won", color: "green" }] },
  tags: { id: "tags", name: "Tags", type: "multi_select", options: [{ id: "t1", value: "VIP", color: "red" }, { id: "t2", value: "EU", color: "blue" }] },
  amount: { id: "amount", name: "Amount", type: "number" },
  owner: { id: "owner", name: "Owner", type: "person" },
  deal: { id: "deal", name: "Deal", type: "relation" },
  note: { id: "note", name: "Note", type: "text" },
  active: { id: "active", name: "Active", type: "checkbox" },
};

interface Row { title: string; values: Record<string, unknown> }
const row = (title: string, values: Record<string, unknown> = {}): Row => ({ title, values });
const snapshot = (records: Row[], visibleProperties = Object.keys(properties)) => widgetSnapshot({
  visibleProperties, properties, records, titleOf: (r) => r.title, valueOf: (r, id) => r.values[id],
});

test("the snapshot is the count, then each record's title and visible values in view order", () => {
  const text = snapshot([
    row("Acme", { stage: "s1", tags: ["t1", "t2"], amount: 1200, note: "first\ncall  done" }),
    row("", { amount: 0 }),
  ], ["name", "stage", "tags", "amount", "note"]);
  assert.equal(text, [
    "2 records",
    "- Acme — Stage: Won; Tags: VIP, EU; Amount: 1,200; Note: first call done",
    "- Untitled — Amount: 0",
  ].join("\n"));
  assert.equal(snapshot([row("Solo")], ["name"]), "1 record\n- Solo");
});

test("a checkbox reads yes or no, so an unchecked box is not dropped", () => {
  assert.equal(snapshot([row("On", { active: true }), row("Off", { active: false }), row("Unset")], ["active"]),
    "3 records\n- On — Active: yes\n- Off — Active: no\n- Unset — Active: no");
});

test("values that are ids (people, relations) and empty cells are left out", () => {
  const text = snapshot([row("Acme", { owner: "user-7f3a", deal: ["page-91"], note: "", stage: null })], ["owner", "deal", "note", "stage"]);
  assert.equal(text, "1 record\n- Acme");
  assert.equal(snapshotValue("user-7f3a", properties.owner), null);
  assert.equal(snapshotValue({ nested: true }, properties.note), null);
});

test("records and properties are capped, and the rest is counted", () => {
  const many = Array.from({ length: SNAPSHOT_MAX_RECORDS + 7 }, (_, i) => row(`Deal ${i}`, { amount: i }));
  const lines = snapshot(many).split("\n");
  assert.equal(lines.length, 1 + SNAPSHOT_MAX_RECORDS + 1);
  assert.equal(lines.at(-1), "… and 7 more");
  assert.equal(lines.includes(`- Deal ${SNAPSHOT_MAX_RECORDS} — Amount: ${SNAPSHOT_MAX_RECORDS}`), false);

  const wide: Record<string, SchemaProperty> = {};
  const values: Record<string, unknown> = {};
  for (let i = 0; i < SNAPSHOT_MAX_PROPERTIES + 3; i += 1) {
    wide[`p${i}`] = { id: `p${i}`, name: `P${i}`, type: "text" };
    values[`p${i}`] = `v${i}`;
  }
  const line = widgetSnapshot({ visibleProperties: Object.keys(wide), properties: wide, records: [row("x", values)], titleOf: (r) => r.title, valueOf: (r, id) => r.values[id] }).split("\n")[1];
  assert.equal(line.split("; ").length, SNAPSHOT_MAX_PROPERTIES);
});

test("C424 without the AI service there is no adapter, so the kit draws no button", () => {
  assert.equal(dashboardAskAI(false), undefined);
});

test("C419 C421 C425 the adapter hands the quote under the widget's title, with no page and nothing sent", () => {
  const onAskAI = dashboardAskAI(true);
  assert.ok(onAskAI);
  useAssistantHandoff.getState().handOff({ attachments: [], text: "an older hand-off" });
  onAskAI({ title: "Open deals", text: "2 records\n- Acme" });
  assert.deepEqual(useAssistantHandoff.getState().take(), {
    attachments: [],
    text: quoteForAssistant([{ author: "Open deals", text: "2 records\n- Acme" }]),
  });
});
