/** Settings › osionos AI status: the rail item, the spend format, and the markup of the status cards. */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatMicroUsd } from "@/features/settings/ai/aiUsageFormat";
import { healthOf } from "@/features/ai/api/aiClient";
import { RAIL_GROUPS } from "@/widgets/activity-rail/model/railItems";
import { ServiceCard, SpendCard } from "@/features/settings/ai/AiStatusCards";

test("the Conversations group lists the Assistant panel right after Conversations", () => {
  const items = RAIL_GROUPS.find((group) => group.id === "conversations")!.items;
  const at = items.findIndex((item) => item.label === "Conversations") + 1;
  assert.deepEqual(items[at]?.action, { kind: "panel", panel: "assistant" });
});

test("formatMicroUsd reads like money, with a floor for real sub-cent spend", () => {
  assert.equal(formatMicroUsd(0, "en-US"), "$0.00");
  assert.equal(formatMicroUsd(4_999, "en-US"), "< $0.01");
  assert.equal(formatMicroUsd(123_456, "en-US"), "$0.12");
  assert.equal(formatMicroUsd(1_000_000, "en-US"), "$1.00");
});

test("the service card says so when the build has no AI service", () => {
  const html = renderToStaticMarkup(React.createElement(ServiceCard, { configured: false, health: { state: "loading" } }));
  assert.ok(html.includes("The AI service is not configured on this build"));
});

test("the service card names the failing part", () => {
  const health = { state: "ready", value: { ok: false, db: true, redis: false } } as const;
  assert.ok(renderToStaticMarkup(React.createElement(ServiceCard, { configured: true, health })).includes("Not reachable (cache)"));
});

test("the health body's \"ok\"/\"down\" strings name the failing part", () => {
  const health = { state: "ready", value: healthOf({ ok: false, db: "ok", redis: "down" }) } as const;
  assert.deepEqual(health.value, { ok: false, db: true, redis: false });
  assert.ok(renderToStaticMarkup(React.createElement(ServiceCard, { configured: true, health })).includes("Not reachable (cache)"));
});

test("the spend card shows money and a meter", () => {
  const usage = { state: "ready", value: { spentMicroUsd: 120_000, limitMicroUsd: 1_000_000 } } as const;
  const html = renderToStaticMarkup(React.createElement(SpendCard, { configured: true, usage }));
  assert.ok(html.includes("$0.12 of $1.00 today"));
  assert.ok(html.includes("<meter"));
});
