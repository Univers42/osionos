import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

function shimLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: () => null,
    length: 0,
  };
}

test("applyViewAction open_panel issues sets the active panel", async () => {
  shimLocalStorage();
  const { useUIStore } = await import("@/shared/config/uiStore");
  const calls: string[] = [];
  useUIStore.setState({ expandToPanel: (panel?: string) => void calls.push(`panel:${panel}`) } as any);
  const { applyViewAction } = await import("@/features/ai/model/viewActions");
  assert.equal(applyViewAction({ action: "open_panel", panel: "issues" }), true);
  assert.deepEqual(calls, ["panel:issues"]);
});

test("a non-admin panel has no All tab and no staff controls", async () => {
  shimLocalStorage();
  const { IssuesPanel } = await import("@/features/issues/ui/IssuesPanel");
  const html = renderToStaticMarkup(React.createElement(IssuesPanel));
  assert.doesNotMatch(html, />All</);
  assert.doesNotMatch(html, /Open GitHub issue/);
  assert.doesNotMatch(html, /Link GitHub issue/);
});
