/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-view-context.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * What a run says about the reader (devil C203, C205): the view the service gets
 * is always one its schema accepts (route 1..200 without the query string, at
 * most 8 tabs with the active pane first, titles cut to 120, ids only when they
 * are uuids), and the "Account context" setting, on by default, decides whether
 * `account` and `view` are sent at all.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import type { InferencePort, StreamInferenceRequest } from "@/features/chat/model/inferencePort";
import type { LayoutNode, PaneNode, WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";


const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

function tab(n: number, kind: WorkspaceTab["kind"] = "page", title = `Tab ${n}`): WorkspaceTab {
  return { tabId: `t${n}`, pageId: uuid(n), workspaceId: "ws", kind, title };
}

function pane(id: string, tabs: WorkspaceTab[]): PaneNode {
  return { type: "pane", id, tabs, activeTabId: tabs[0]?.tabId ?? null };
}

function split(...children: LayoutNode[]): LayoutNode {
  return { type: "split", id: "s", direction: "row", children, sizes: children.map(() => 100 / children.length) };
}

test("the route is the path only, cut to 200, and never empty", async () => {
  const { buildRunView } = await import("@/features/ai/model/viewContext");
  const base = { layoutRoot: pane("p", []), activePaneId: "p", activePage: null, panel: null };
  assert.equal(buildRunView({ ...base, pathname: "/" + "a".repeat(299) }).route.length, 200);
  assert.equal(buildRunView({ ...base, pathname: "/reset?token=s3cr3t" }).route, "/reset");
  assert.equal(buildRunView({ ...base, pathname: "" }).route, "/");
});

test("12 tabs give 8, the active pane's first; split vs single", async () => {
  const { buildRunView } = await import("@/features/ai/model/viewContext");
  const left = pane("left", [1, 2, 3, 4, 5, 6].map((n) => tab(n)));
  const right = pane("right", [7, 8, 9, 10, 11, 12].map((n) => tab(n)));
  const view = buildRunView({ pathname: "/", layoutRoot: split(left, right), activePaneId: "right", activePage: null, panel: null });
  assert.equal(view.layout, "split");
  assert.equal(view.tabs?.length, 8);
  assert.deepEqual(view.tabs?.slice(0, 6).map((t) => t.title), ["Tab 7", "Tab 8", "Tab 9", "Tab 10", "Tab 11", "Tab 12"]);
  assert.equal(buildRunView({ pathname: "/", layoutRoot: left, activePaneId: "left", activePage: null, panel: null }).layout, "single");
});

test("titles are cut to 120, kinds are mapped, and a non-uuid id is dropped", async () => {
  const { buildRunView } = await import("@/features/ai/model/viewContext");
  const tabs = [tab(1, "page", "x".repeat(500)), { ...tab(2, "database"), pageId: "demo-page" }, tab(3, "settings")];
  const view = buildRunView({
    pathname: "/",
    layoutRoot: pane("p", tabs),
    activePaneId: "p",
    activePage: { id: "not-a-uuid", title: "Demo" },
    panel: "search",
  });
  assert.equal(view.tabs?.[0].title.length, 120);
  assert.deepEqual(view.tabs?.map((t) => t.kind), ["page", "database", "other"]);
  assert.equal(view.tabs?.[1].pageId, undefined, "a non-uuid tab id is not sent");
  assert.equal(view.activePage, undefined, "a non-uuid active page would make the service refuse the run");
  assert.equal(view.panel, "search");
});

test("a persisted store without accountContext reads it as on; the toggle writes off", async () => {
  const { useAiSettingsStore, defaultAiSettings } = await import("@/store/settings/useAiSettingsStore");
  const old = { ...defaultAiSettings("ws-old") } as Record<string, unknown>;
  delete old.accountContext;
  useAiSettingsStore.setState({ data: { "ws-old": old as never } });
  assert.equal(useAiSettingsStore.getState().getData("ws-old").accountContext, true);
  useAiSettingsStore.getState().update("ws-old", { accountContext: false });
  assert.equal(useAiSettingsStore.getState().getData("ws-old").accountContext, false);
  assert.equal(defaultAiSettings("ws-new").accountContext, true, "on by default");
});

test("the send path: on sends account and view, off sends neither", async () => {
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const { useAiSettingsStore } = await import("@/store/settings/useAiSettingsStore");
  const seen: Array<StreamInferenceRequest["context"]> = [];
  const port: InferencePort = {
    async complete() {
      return { content: "" };
    },
    async stream(request, onEvent) {
      seen.push(request.context);
      onEvent("done", {});
    },
  };
  setInferencePort(port);
  const s = useChatStore.getState();
  const conversation = s.createConversation(null, { title: "Context" });

  useAiSettingsStore.getState().update("local-workspace", { accountContext: true });
  await s.send(conversation.id, "who am I?");
  assert.equal(seen[0]?.account, true);
  assert.equal(typeof seen[0]?.view?.route, "string");

  useAiSettingsStore.getState().update("local-workspace", { accountContext: false });
  await s.send(conversation.id, "who am I?");
  assert.equal(seen[1]?.account, undefined);
  assert.equal(seen[1]?.view, undefined);
});
