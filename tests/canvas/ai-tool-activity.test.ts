/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-tool-activity.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * What the assistant is doing — the calls it makes to its tools.
 *
 * Pure logic and rendering only: no JSX, no server, no network.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { toolActivitiesFromParts, type ToolActivityPart } from "@/features/chat/model/toolActivity";
import { ToolActivity } from "@/features/chat/model/toolActivityView";

/* -------------------------------------------------------------------------- */
/* The store, and the frames of a run                                         */
/* -------------------------------------------------------------------------- */

function shimLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: () => null,
    length: 0,
  };
}

/** A port that answers with the frames it is given. */
function fakePort(frames: Array<[string, Record<string, unknown>]>) {
  return {
    async complete() {
      return { content: "" };
    },
    async stream(
      _request: unknown,
      onEvent: (event: string, data: Record<string, unknown>) => void,
    ) {
      for (const [event, data] of frames) onEvent(event, data);
    },
  };
}

/** A run that searches the workspace, and finds two passages. */
const SEARCH_RUN: Array<[string, Record<string, unknown>]> = [
  ["run.started", { runId: "run-1" }],
  [
    "tool.called",
    { toolCallId: "call-1", toolName: "search_workspace", input: { query: "budget" } },
  ],
  ["citation", { n: 1, pageId: "page-a", title: "Alpha", snippet: "the first source" }],
  ["citation", { n: 2, pageId: "page-b", title: "Beta", snippet: "the second source" }],
  ["tool.result", { toolCallId: "call-1", toolName: "search_workspace", ok: true }],
  ["text.delta", { text: "Here is the budget." }],
  ["done", {}],
];

/** The calls of the answer of a run, as the reader sees them. */
async function activitiesOf(frames: Array<[string, Record<string, unknown>]>): Promise<ToolActivityPart[]> {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();
  setInferencePort(fakePort(frames));
  const conversation = s().createConversation(null);
  await s().send(conversation.id, "what is the budget");
  const assistant = s().messagesFor(conversation.id)[1];
  return toolActivitiesFromParts(assistant.parts);
}

/** The lines of the calls, as the browser would show them. */
function lines(activities: ToolActivityPart[]): string {
  return renderToStaticMarkup(React.createElement(ToolActivity, { activities }));
}

/* -------------------------------------------------------------------------- */
/* The frames become the parts of the answer                                  */
/* -------------------------------------------------------------------------- */

test("the frames of a run become the parts of the answer", async () => {
  const activities = await activitiesOf(SEARCH_RUN);
  assert.equal(activities.length, 1, "one call, one part");
  assert.equal(activities[0].toolName, "search_workspace");
  assert.equal(activities[0].label, "budget", "the query is the label of the call");
  assert.equal(activities[0].status, "done", "the outcome of the call is kept");
  assert.equal(activities[0].count, 2, "the passages the call found are counted");
});

test("the answer keeps the sources of the call beside it", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();
  setInferencePort(fakePort(SEARCH_RUN));
  const conversation = s().createConversation(null);
  await s().send(conversation.id, "what is the budget");

  const assistant = s().messagesFor(conversation.id)[1];
  const types = (assistant.parts ?? []).map((part) => part.type);
  assert.deepEqual(types, ["tool-activity", "citation", "citation"], "the parts keep their order");
  assert.equal(assistant.content, "Here is the budget.");
});

test("a call that runs is still running", async () => {
  const activities = await activitiesOf([
    [
      "tool.called",
      { toolCallId: "call-1", toolName: "search_workspace", input: { query: "budget" } },
    ],
    ["text.delta", { text: "…" }],
  ]);
  assert.equal(activities[0].status, "running");
  assert.match(lines(activities), /Searching your workspace for/);
  assert.match(lines(activities), /budget/);
});

test("a read of a page takes the title of the page it read", async () => {
  const activities = await activitiesOf([
    ["tool.called", { toolCallId: "call-2", toolName: "read_page", input: { pageId: "page-a" } }],
    ["citation", { n: 1, pageId: "page-a", title: "The budget", snippet: "the first source" }],
    ["tool.result", { toolCallId: "call-2", toolName: "read_page", ok: true }],
    ["done", {}],
  ]);
  assert.equal(activities[0].label, "The budget");
  assert.equal(activities[0].status, "done");
  assert.match(lines(activities), /Read <span[^>]*>The budget<\/span>/, "the line reads the title of the page");
});

test("a result whose call was never seen is ignored", async () => {
  const activities = await activitiesOf([
    ["tool.result", { toolCallId: "call-x", toolName: "search_workspace", ok: true }],
    ["text.delta", { text: "Here is the budget." }],
    ["done", {}],
  ]);
  assert.deepEqual(activities, [], "no call, no line");
});

test("a failed call says it failed, and never says why", async () => {
  const activities = await activitiesOf([
    [
      "tool.called",
      { toolCallId: "call-3", toolName: "search_workspace", input: { query: "budget" } },
    ],
    [
      "tool.result",
      {
        toolCallId: "call-3",
        toolName: "search_workspace",
        ok: false,
        error: "the search failed: the pages could not be reached",
      },
    ],
    ["done", {}],
  ]);
  assert.equal(activities[0].status, "failed");
  const html = lines(activities);
  assert.match(html, /Couldn&#x27;t search your workspace|Couldn't search your workspace/);
  assert.doesNotMatch(html, /could not be reached/, "the internals of the failure stay in the service");
});

test("the result of a tool is never kept", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();
  setInferencePort(
    fakePort([
      ["tool.called", { toolCallId: "call-4", toolName: "read_page", input: { pageId: "page-a" } }],
      [
        "tool.result",
        {
          toolCallId: "call-4",
          toolName: "read_page",
          ok: true,
          output: "the secret text of the page",
        },
      ],
      ["done", {}],
    ]),
  );
  const conversation = s().createConversation(null);
  await s().send(conversation.id, "read it");

  const assistant = s().messagesFor(conversation.id)[1];
  assert.doesNotMatch(
    JSON.stringify(assistant.parts ?? []),
    /secret text/,
    "the text of a page never reaches the message",
  );
});

/* -------------------------------------------------------------------------- */
/* The lines                                                                  */
/* -------------------------------------------------------------------------- */

test("an unknown tool shows a generic line", () => {
  const activities: ToolActivityPart[] = [
    { type: "tool-activity", toolCallId: "call-9", toolName: "write_page", label: "", status: "running" },
  ];
  const html = lines(activities);
  assert.match(html, /Working/);
  assert.doesNotMatch(html, /write_page/, "the name of an unknown tool is not shown");
});

test("a query is text, never markup", () => {
  const hostile = "<img src=x onerror=alert(1)>";
  const activities: ToolActivityPart[] = [
    {
      type: "tool-activity",
      toolCallId: "call-10",
      toolName: "search_workspace",
      label: hostile,
      status: "running",
    },
  ];
  const html = lines(activities);
  assert.doesNotMatch(html, /<img/i, "the payload is never an element");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, "the payload is shown as text");
});

test("the lines fold to the last one when there are many of them", () => {
  const activities: ToolActivityPart[] = [1, 2, 3, 4].map((index) => ({
    type: "tool-activity",
    toolCallId: `call-${index}`,
    toolName: "search_workspace",
    label: `query ${index}`,
    status: "running",
  }));
  const html = lines(activities);
  assert.doesNotMatch(html, /query 1/, "the first lines are folded away");
  assert.match(html, /query 4/, "the last line is shown");
  assert.match(html, /aria-expanded="false"/, "the button says the list is closed");
  assert.match(html, /Show the 4 steps/);
});

test("three lines are shown as they are", () => {
  const activities: ToolActivityPart[] = [1, 2, 3].map((index) => ({
    type: "tool-activity",
    toolCallId: `call-${index}`,
    toolName: "search_workspace",
    label: `query ${index}`,
    status: "running",
  }));
  const html = lines(activities);
  assert.match(html, /query 1/);
  assert.match(html, /query 3/);
  assert.doesNotMatch(html, /aria-expanded/, "three lines need no button");
});

test("two parallel searches credit their own citations", async () => {
  const activities = await activitiesOf([
    ["tool.called", { toolCallId: "_1", toolName: "search_workspace", input: { query: "a" } }],
    ["tool.called", { toolCallId: "_2", toolName: "search_workspace", input: { query: "b" } }],
    ["citation", { n: 1, pageId: "p1", title: "T", snippet: "s1", toolCallId: "_1" }],
    ["citation", { n: 2, pageId: "p2", title: "T", snippet: "s2", toolCallId: "_1" }],
    ["citation", { n: 3, pageId: "p3", title: "T", snippet: "s3", toolCallId: "_2" }],
    ["citation", { n: 4, pageId: "p4", title: "T", snippet: "s4", toolCallId: "_2" }],
    ["citation", { n: 5, pageId: "p5", title: "T", snippet: "s5", toolCallId: "_2" }],
  ]);
  const first = activities.find((activity) => activity.toolCallId === "_1");
  const second = activities.find((activity) => activity.toolCallId === "_2");
  assert.equal(first?.count, 2, "the first search gets its two citations");
  assert.equal(second?.count, 3, "the second search gets its three citations");
});

test("an untagged citation goes to the last running search", async () => {
  const activities = await activitiesOf([
    ["tool.called", { toolCallId: "_1", toolName: "search_workspace", input: { query: "a" } }],
    ["tool.called", { toolCallId: "_2", toolName: "search_workspace", input: { query: "b" } }],
    ["citation", { n: 1, pageId: "p1", title: "T", snippet: "s1" }],
  ]);
  const first = activities.find((activity) => activity.toolCallId === "_1");
  const second = activities.find((activity) => activity.toolCallId === "_2");
  assert.equal(first?.count ?? 0, 0, "the first search gets nothing");
  assert.equal(second?.count, 1, "the untagged citation goes to the last running search");
});

test("a search that found only passages cited before counts what it found", async () => {
  const activities = await activitiesOf([
    ["tool.called", { toolCallId: "_1", toolName: "search_workspace", input: { query: "a" } }],
    ["tool.result", { toolCallId: "_1", toolName: "search_workspace", ok: true, found: 8 }],
  ]);
  assert.equal(activities[0]?.count, 8, "8 passages, not \"no passages\"");
});
