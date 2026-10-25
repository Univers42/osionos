import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";


test("applyViewAction open_panel issues sets the active panel", async () => {
  const { useUIStore } = await import("@/shared/config/uiStore");
  const calls: string[] = [];
  useUIStore.setState({ expandToPanel: (panel?: string) => void calls.push(`panel:${panel}`) } as any);
  const { applyViewAction } = await import("@/features/ai/model/viewActions");
  assert.equal(applyViewAction({ action: "open_panel", panel: "issues" }), true);
  assert.deepEqual(calls, ["panel:issues"]);
});

test("a non-admin panel has no All tab and no staff controls", async () => {
  const { IssuesPanel } = await import("@/features/issues/ui/IssuesPanel");
  const html = renderToStaticMarkup(React.createElement(IssuesPanel));
  assert.doesNotMatch(html, />All</);
  assert.doesNotMatch(html, /Open GitHub issue/);
  assert.doesNotMatch(html, /Link GitHub issue/);
});
