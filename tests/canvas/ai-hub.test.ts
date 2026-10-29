/** The AI Hub: its tab, its rail item, the spend format, and the markup of its pieces. */

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatMicroUsd } from "@/features/settings/ai/aiUsageFormat";
import { healthOf } from "@/features/ai/api/aiClient";
import { RAIL_GROUPS } from "@/widgets/activity-rail/model/railItems";
import { ServiceCard, SpendCard } from "@/widgets/ai-hub/ui/HubCards";
import { HUB_SECTIONS } from "@/widgets/ai-hub/ui/hubSections";
import { AiHubView } from "@/widgets/ai-hub/ui/AiHubView";
import { openAiHub, useAiHubNav } from "@/features/ai/model/aiHubNav";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { aiHubTab } from "@/widgets/workspace-grid/model/layoutPersist";

test("aiHubTab is an ai-hub tab with a stable pageId", () => {
  const first = aiHubTab();
  const second = aiHubTab();
  assert.equal(first.kind, "ai-hub");
  assert.equal(first.title, "AI Hub");
  assert.equal(first.pageId, second.pageId);
});

test("the Conversations group lists AI Hub right after Conversations", () => {
  const labels = RAIL_GROUPS.find((group) => group.id === "conversations")!.items.map((item) => item.label);
  assert.equal(labels.indexOf("AI Hub"), labels.indexOf("Conversations") + 1);
});

test("formatMicroUsd reads like money, with a floor for real sub-cent spend", () => {
  assert.equal(formatMicroUsd(0, "en-US"), "$0.00");
  assert.equal(formatMicroUsd(4_999, "en-US"), "< $0.01");
  assert.equal(formatMicroUsd(123_456, "en-US"), "$0.12");
  assert.equal(formatMicroUsd(1_000_000, "en-US"), "$1.00");
});

test("the view lists every section in a labelled nav, Overview selected", () => {
  const html = renderToStaticMarkup(React.createElement(AiHubView));
  assert.match(html, /<nav[^>]*aria-label="AI Hub sections"/);
  for (const section of HUB_SECTIONS) assert.ok(html.includes(`>${section.label.replace("&", "&amp;")}</button>`), section.label);
  assert.match(html, /aria-current="page"[^>]*>Overview<\/button>/);
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

// renderToStaticMarkup reads zustand's server snapshot, which is the initial state, so
// the initial state follows the section the test asked for.
const serverSection = (section: "overview" | "memory") => { useAiHubNav.getInitialState().section = section; };

afterEach(() => {
  useAiHubNav.getState().request("overview");
  serverSection("overview");
});

test("request sets the section, and AiHubView marks it current", () => {
  useAiHubNav.getState().request("memory");
  assert.equal(useAiHubNav.getState().section, "memory");
  serverSection("memory");
  const html = renderToStaticMarkup(React.createElement(AiHubView));
  assert.match(html, /aria-current="page"[^>]*>Memory</);
});

test("openAiHub twice leaves one Hub tab and the last section", () => {
  useWorkspaceLayout.setState({ root: { type: "pane", id: "p1", tabs: [], activeTabId: null }, activePaneId: "p1" });
  openAiHub("memory");
  openAiHub("overview");
  const root = useWorkspaceLayout.getState().root;
  assert.equal(root.type === "pane" ? root.tabs.filter((tab) => tab.kind === "ai-hub").length : -1, 1);
  assert.equal(useAiHubNav.getState().section, "overview");
});
