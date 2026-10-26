/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-slash-palette.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The "/" palette: when it opens, what it lists, how a prompt expands, and
 * what the keys do. No DOM in this suite, so the markup is checked
 * structurally, like the approval card.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CHAT_ACTIONS,
  expandPrompt,
  expandSlashText,
  filterCommands,
  mergeCommands,
  paletteKey,
  slashQuery,
  type ChatCommand,
} from "@/features/ai/model/chatCommands";
import { SlashPalette } from "@/features/ai/ui/SlashPalette";

const prompt = (name: string, description = "", template = "T $ARGUMENTS"): ChatCommand => ({
  name,
  description,
  kind: "prompt",
  template,
});

test("slashQuery opens only on a leading /word before the caret", () => {
  assert.equal(slashQuery("/", 1), "");
  assert.equal(slashQuery("/sum", 4), "sum");
  assert.equal(slashQuery("hello /sum", 10), null);
  assert.equal(slashQuery("https://x/y", 11), null);
  assert.equal(slashQuery("/sum", 0), null);
  assert.equal(slashQuery("/sum text", 9), null);
  assert.equal(slashQuery("/sum text", 4), "sum");
});

test("filterCommands orders prefix, then name substring, then description", () => {
  const list = [prompt("xsum"), prompt("other", "about sum"), prompt("summarize"), prompt("sum")];
  assert.deepEqual(filterCommands(list, "sum").map((c) => c.name), ["summarize", "sum", "xsum", "other"]);
  assert.equal(filterCommands(list, "").length, 4);
  const many = Array.from({ length: 20 }, (_, i) => prompt(`c${i}`));
  assert.equal(filterCommands(many, "").length, 12);
  assert.equal(filterCommands(many, "c").length, 12);
});

test("mergeCommands drops editor-only commands and lets an action win a name", () => {
  const service = [
    { name: "new", description: "dup", template: "x", surface: "chat" as const },
    { name: "fix", description: "editor", template: "x", surface: "editor" as const },
    { name: "summarize", description: "s", template: "S $ARGUMENTS", surface: "both" as const },
  ];
  const merged = mergeCommands(CHAT_ACTIONS, service);
  assert.deepEqual(merged.slice(0, CHAT_ACTIONS.length), [...CHAT_ACTIONS]);
  assert.deepEqual(merged.slice(CHAT_ACTIONS.length).map((c) => [c.name, c.kind]), [["summarize", "prompt"]]);
  assert.equal(merged.find((c) => c.name === "new")?.kind, "action");
});

test("expandPrompt fills every $ARGUMENTS and appends when there is none", () => {
  assert.equal(expandPrompt("Summarize: $ARGUMENTS", "  the page "), "Summarize: the page");
  assert.equal(expandPrompt("A $ARGUMENTS / B $ARGUMENTS", "x"), "A x / B x");
  assert.equal(expandPrompt("Translate", "hello"), "Translate\n\nhello");
  assert.equal(expandPrompt("Translate", ""), "Translate");
  assert.equal(expandPrompt("Summarize:   $ARGUMENTS  now", ""), "Summarize: now");
});

test("expandSlashText expands a known prompt and leaves the rest as typed", () => {
  const list = mergeCommands(CHAT_ACTIONS, [{ name: "summarize", description: "", template: "S: $ARGUMENTS", surface: "chat" }]);
  assert.equal(expandSlashText("/summarize the notes", list), "S: the notes");
  assert.equal(expandSlashText("/unknown thing", list), null);
  assert.equal(expandSlashText("/new", list), null);
  assert.equal(expandSlashText("plain", list), null);
});

test("paletteKey wraps, picks on Enter and Tab, and closes on Escape", () => {
  const state = { open: true, index: 0, count: 3 };
  assert.equal(paletteKey(state, "ArrowUp").index, 2);
  assert.equal(paletteKey({ ...state, index: 2 }, "ArrowDown").index, 0);
  assert.equal(paletteKey({ ...state, index: 1 }, "Enter").pick, 1);
  assert.equal(paletteKey({ ...state, index: 1 }, "Tab").pick, 1);
  assert.equal(paletteKey(state, "Escape").open, false);
  assert.equal(paletteKey(state, "a").handled, false);
  assert.equal(paletteKey({ ...state, open: false }, "Enter").handled, false);
  const empty = paletteKey({ open: true, index: 0, count: 0 }, "Enter");
  assert.equal(empty.pick, undefined);
  assert.equal(empty.handled, true);
});

test("SlashPalette renders a listbox with exactly one selected option", () => {
  const html = renderToStaticMarkup(
    React.createElement(SlashPalette, {
      commands: [...CHAT_ACTIONS.slice(0, 3)],
      query: "",
      index: 1,
      placement: "above",
      onHover: () => {},
      onPick: () => {},
    }),
  );
  assert.match(html, /role="listbox"/);
  assert.match(html, /aria-label="Commands"/);
  assert.equal(html.match(/role="option"/g)?.length, 3);
  assert.equal(html.match(/aria-selected="true"/g)?.length, 1);
  assert.match(html, /\/model/);
});

test("SlashPalette says when nothing matches", () => {
  const html = renderToStaticMarkup(
    React.createElement(SlashPalette, { commands: [], query: "zz", index: 0, placement: "below", onHover: () => {}, onPick: () => {} }),
  );
  assert.match(html, /No command matches \/zz/);
  assert.doesNotMatch(html, /role="option"/);
});

test("the empty query lists the hub actions, and the keyword and prefix find them", () => {
  const names = filterCommands(CHAT_ACTIONS, "").map((c) => c.name);
  for (const name of ["skills", "memory", "mcp", "hub"]) assert.ok(names.includes(name), name);
  assert.equal(filterCommands(CHAT_ACTIONS, "mem")[0].name, "memory");
  assert.ok(filterCommands(CHAT_ACTIONS, "token").some((c) => c.name === "mcp"));
});

test("every action stays visible ahead of the service commands under the cap", () => {
  const service = Array.from({ length: 10 }, (_, i) => ({ name: `svc${i}`, description: "", template: "x", surface: "chat" as const }));
  const shown = filterCommands(mergeCommands(CHAT_ACTIONS, service), "").map((c) => c.name);
  for (const action of CHAT_ACTIONS) assert.ok(shown.includes(action.name), action.name);
});

test("/effort is listed only while the effort picker is in the composer", () => {
  assert.ok(!filterCommands(CHAT_ACTIONS, "", (name) => name !== "effort").some((c) => c.name === "effort"));
  assert.ok(!filterCommands(CHAT_ACTIONS, "effort", (name) => name !== "effort").some((c) => c.name === "effort"));
  assert.ok(filterCommands(CHAT_ACTIONS, "effort", () => true).some((c) => c.name === "effort"));
});
