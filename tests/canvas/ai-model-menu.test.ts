/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-model-menu.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+       */
/*                                                +#+#+#+#+#+   +#+           */
/*    Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#            */
/*    Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr      */
/*                                                                            */
/* ************************************************************************** */

// The model menu as data: Auto, the recommended four, the families, the older
// models, the pins and the reader's own connections.

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { setAiTransport } from "@/features/ai/api/aiClient";
import { aiInferencePort } from "@/features/ai/model/aiInferencePort";
import { ModelRowItem } from "@/widgets/chat-shell/ui/ModelMenuParts";

import {
  AI_STARRED_STORAGE_KEY,
  MAX_RECOMMENDED,
  buildModelMenu,
  fallbackModels,
  familyOf,
  generationOf,
  isAutoSelection,
  olderIds,
  parseStarred,
  pillLabel,
  readStarred,
  toggleStarred,
  writeStarred,
  type MenuModel,
} from "@/features/ai/model/modelMenu";

const model = (id: string, extra: Partial<MenuModel> = {}): MenuModel => ({ id, label: id.split("/").pop() ?? id, ...extra });

const PLATFORM: MenuModel[] = [
  model("anthropic/claude-sonnet-4-5", { default: true, reasoning: true }),
  model("anthropic/claude-3-5-sonnet"),
  model("google/gemini-2.5-pro"),
  model("google/gemini-1.5-flash"),
  model("openai/gpt-5"),
  model("openai/gpt-4o"),
  model("x-ai/grok-4"),
  model("meta-llama/llama-3.1-70b-instruct"),
  model("qwen/qwen3-coder"),
];

const AUTO = { connectionId: "platform", model: "anthropic/claude-sonnet-4-5" };
const view = (extra: Partial<Parameters<typeof buildModelMenu>[0]> = {}) =>
  buildModelMenu({ selection: AUTO, platformModels: PLATFORM, connections: [], starred: [], ...extra });

test("Auto is the platform connection on its default model, or on no model yet", () => {
  assert.equal(isAutoSelection(AUTO, PLATFORM), true);
  assert.equal(isAutoSelection({ connectionId: "platform", model: "" }, PLATFORM), true);
  assert.equal(isAutoSelection({ connectionId: "platform", model: "anything" }, []), true);
  assert.equal(isAutoSelection({ connectionId: "platform", model: "openai/gpt-5" }, PLATFORM), false);
  assert.equal(isAutoSelection({ connectionId: "mine", model: "anthropic/claude-sonnet-4-5" }, PLATFORM), false);
});

test("the pill says Auto, else the label of the chosen model", () => {
  const lists = { platform: PLATFORM, mine: [model("m1", { label: "My model" })] };
  assert.equal(pillLabel(AUTO, lists), "Auto");
  assert.equal(pillLabel({ connectionId: "platform", model: "openai/gpt-5" }, lists), "gpt-5");
  assert.equal(pillLabel({ connectionId: "mine", model: "m1" }, lists), "My model");
  assert.equal(pillLabel({ connectionId: "mine", model: "vendor/gone" }, lists), "gone");
});

test("the family comes from the id: vendor prefix or name stem", () => {
  assert.equal(familyOf("anthropic/claude-sonnet-4-5"), "claude");
  assert.equal(familyOf("claude-3-5-haiku"), "claude");
  assert.equal(familyOf("google/gemini-2.5-pro"), "gemini");
  assert.equal(familyOf("google/gemma-3-27b"), "open");
  assert.equal(familyOf("openai/gpt-5"), "gpt");
  assert.equal(familyOf("openai/gpt-oss-120b"), "open");
  assert.equal(familyOf("o3-mini"), "gpt");
  assert.equal(familyOf("x-ai/grok-4"), "grok");
  assert.equal(familyOf("somevendor/model-1"), "open");
  assert.equal(familyOf("plain-name"), "other");
});

test("the menu groups the rest by family, in the fixed order, with human headings", () => {
  const groups = view().groups;
  assert.deepEqual(groups.map((group) => group.heading), ["Open models"]);
  assert.deepEqual(groups[0].rows.map((row) => row.model), ["meta-llama/llama-3.1-70b-instruct", "qwen/qwen3-coder"]);
  const wide = view({ platformModels: [...PLATFORM, model("plain-name"), model("anthropic/claude-haiku-4-5")] }).groups;
  assert.deepEqual(wide.map((group) => group.heading), ["Claude", "Open models", "Other"]);
});

test("Recommended holds the default first, then the newest of each family, at most four", () => {
  const recommended = view().recommended;
  assert.deepEqual(recommended.map((row) => row.model), [
    "anthropic/claude-sonnet-4-5",
    "google/gemini-2.5-pro",
    "openai/gpt-5",
    "x-ai/grok-4",
  ]);
  assert.ok(recommended.length <= MAX_RECOMMENDED);
});

test("a pinned model goes into Recommended ahead of the family picks, and the cap still holds", () => {
  const pinned = view({ starred: ["openai/gpt-4o"] }).recommended.map((row) => row.model);
  assert.deepEqual(pinned.slice(0, 2), ["anthropic/claude-sonnet-4-5", "openai/gpt-4o"]);
  assert.equal(pinned.length, MAX_RECOMMENDED);
  const many = view({ starred: PLATFORM.map((entry) => entry.id) }).recommended;
  assert.equal(many.length, MAX_RECOMMENDED);
  assert.equal(many[0].model, "anthropic/claude-sonnet-4-5");
  assert.equal(view({ starred: ["gone/model"] }).recommended.length, 4);
});

test("a model a whole generation behind the newest of its family is older", () => {
  assert.deepEqual([...olderIds(PLATFORM)].sort(), ["anthropic/claude-3-5-sonnet", "google/gemini-1.5-flash", "openai/gpt-4o"]);
  const menu = view();
  assert.deepEqual(menu.older.map((row) => row.model), ["anthropic/claude-3-5-sonnet", "google/gemini-1.5-flash", "openai/gpt-4o"]);
  assert.ok(menu.groups.every((group) => group.rows.every((row) => !menu.older.some((old) => old.model === row.model))));
});

test("a minor step is not older, a name with no generation is never older, open lines do not age each other", () => {
  assert.equal(olderIds([model("claude-sonnet-4"), model("claude-sonnet-4-5")]).size, 0);
  assert.equal(olderIds([model("gpt-oss-120b"), model("gpt-5")]).size, 0);
  assert.equal(olderIds([model("mistral-large-latest"), model("claude-3-opus"), model("claude-4-opus")]).size, 1);
  assert.equal(olderIds([model("meta-llama/llama-3.1-70b"), model("qwen/qwen3-coder")]).size, 0);
  assert.equal(olderIds([model("meta-llama/llama-2-70b"), model("meta-llama/llama-3.1-70b")]).size, 1);
  assert.equal(generationOf("claude-3-5-sonnet-20241022"), 3.05);
  assert.equal(generationOf("gpt-4o"), 4);
  assert.equal(generationOf("gpt-oss-120b"), null);
});

test("a pin round-trips: toggle on, stored, read back, toggle off", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
  const on = toggleStarred([], "openai/gpt-4o");
  writeStarred(on, storage);
  assert.equal(store.get(AI_STARRED_STORAGE_KEY), '["openai/gpt-4o"]');
  assert.deepEqual(readStarred(storage), ["openai/gpt-4o"]);
  assert.deepEqual(toggleStarred(readStarred(storage), "openai/gpt-4o"), []);
  assert.deepEqual(view({ starred: on }).older.find((row) => row.model === "openai/gpt-4o")?.starred, true);
});

test("the stored pins survive garbage, a refusing storage and no storage", () => {
  assert.deepEqual(parseStarred("nope"), []);
  assert.deepEqual(parseStarred(["a", "a", 3, "", "b"]), ["a", "b"]);
  assert.deepEqual(readStarred({ getItem: () => "{broken", setItem: () => undefined }), []);
  assert.deepEqual(readStarred(null), []);
  assert.doesNotThrow(() => writeStarred(["a"], { getItem: () => null, setItem: () => { throw new Error("quota"); } }));
  assert.doesNotThrow(() => writeStarred(["a"], null));
});

test("the reader's own connections stay, with their models and the selected one marked", () => {
  const mine = [
    { id: "key-1", label: "My OpenAI key", models: [model("gpt-4.1", { reasoning: true }), model("gpt-4o-mini")] },
    { id: "device", label: "This device", models: [model("llama3.2")] },
    { id: "platform", label: "Platform", models: [model("never")] },
  ];
  const menu = view({ connections: mine, selection: { connectionId: "key-1", model: "gpt-4o-mini" } });
  assert.deepEqual(menu.connections.map((entry) => entry.id), ["key-1", "device"]);
  assert.equal(menu.autoSelected, false);
  assert.equal(menu.connections[0].selected, true);
  assert.deepEqual(menu.connections[0].models.map((row) => [row.model, row.selected, row.reasoning]), [["gpt-4.1", false, true], ["gpt-4o-mini", true, false]]);
  assert.ok(menu.connections[0].models.every((row) => row.connectionId === "key-1" && !row.starred));
});

test("Auto carries the check; the default model row in Recommended does not repeat it", () => {
  assert.equal(view().autoSelected, true);
  assert.equal(view().recommended[0].selected, false);
  const other = view({ selection: { connectionId: "platform", model: "openai/gpt-5" } });
  assert.equal(other.autoSelected, false);
  assert.equal(other.recommended.find((row) => row.model === "openai/gpt-5")?.selected, true);
});

/* ------------------ free-model pool: Auto, the label, FA23/FA24 ------------------ */

const MAY_TRAIN_LABEL = "May use prompts for training";

async function sentModel(model: string | undefined): Promise<unknown> {
  let body: Record<string, unknown> = {};
  setAiTransport(async (_url, init) => {
    body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response("event: done\ndata: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  await aiInferencePort.stream!(
    { connectorId: "ai", model, messages: [], text: "hi", connectionId: "platform", serverConversationId: "conv-1" },
    () => undefined,
  );
  return body.model;
}

test("auto selection sends model \"auto\"", async () => {
  assert.equal(await sentModel("auto"), "auto");
  assert.equal(await sentModel(undefined), "auto");
  assert.equal(await sentModel("  "), "auto");
  assert.equal(await sentModel("openai/gpt-5"), "openai/gpt-5");
});

test("may-train item carries the label", () => {
  const menu = view({ platformModels: [model("a/free", { dataUse: "may-train" }), model("a/safe", { dataUse: "no-train" })] });
  const rows = [...menu.recommended, ...menu.groups.flatMap((group) => group.rows), ...menu.older];
  const html = (id: string) => renderToStaticMarkup(React.createElement(ModelRowItem, { row: rows.find((row) => row.model === id)!, onPick: () => undefined }));
  assert.ok(html("a/free").includes(MAY_TRAIN_LABEL));
  assert.ok(!html("a/safe").includes(MAY_TRAIN_LABEL));
  assert.ok(html("a/free").includes("--osio-fg-muted"));
});

test("fallback picker omits may-train", () => {
  const list = [model("a/free", { dataUse: "may-train", default: true }), model("a/safe", { dataUse: "no-train" })];
  assert.deepEqual(fallbackModels(list).map((entry) => entry.id), ["a/safe"]);
});

test("missing dataUse treated as may-train", () => {
  const list = [model("a/unknown"), model("a/safe", { dataUse: "no-train" })];
  assert.deepEqual(fallbackModels(list).map((entry) => entry.id), ["a/safe"]);
  const row = view({ platformModels: list }).groups.flatMap((group) => group.rows).concat(view({ platformModels: list }).recommended).find((r) => r.model === "a/unknown");
  assert.equal(row?.mayTrain, true);
});
