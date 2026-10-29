/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   space-ai-shortcut.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "Space on an empty paragraph opens Edit with AI" — the guard is a pure
 * predicate, so its whole truth table is pinned here. Every "false" row is a
 * case that must keep typing a space (or must not act at all).
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldOpenAiOnSpace,
  type SpaceAiShortcutInput,
} from "@/features/block-editor/model/spaceAiShortcut";

const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };

/** The one combination that opens the prompt. */
function opens(overrides: Partial<SpaceAiShortcutInput> = {}): boolean {
  return shouldOpenAiOnSpace({
    key: " ",
    mods: NO_MODS,
    composing: false,
    type: "paragraph",
    isEmpty: true,
    editable: true,
    aiConfigured: true,
    ...overrides,
  });
}

test("Space on an empty paragraph, with the assistant configured, opens AI", () => {
  assert.equal(opens(), true);
});

test("a key other than Space never opens AI", () => {
  assert.equal(opens({ key: "Enter" }), false);
  assert.equal(opens({ key: "a" }), false);
  assert.equal(opens({ key: "Spacebar" }), false);
});

test("every modifier keeps the plain space (and its native meaning)", () => {
  assert.equal(opens({ mods: { ...NO_MODS, shift: true } }), false);
  assert.equal(opens({ mods: { ...NO_MODS, ctrl: true } }), false);
  assert.equal(opens({ mods: { ...NO_MODS, alt: true } }), false);
  assert.equal(opens({ mods: { ...NO_MODS, meta: true } }), false);
});

test("an IME composition owns the key", () => {
  assert.equal(opens({ composing: true }), false);
});

test("only a paragraph opens AI — headings, lists, to-dos and quotes keep their space", () => {
  for (const type of [
    "heading_1",
    "heading_2",
    "heading_3",
    "heading_4",
    "heading_5",
    "heading_6",
    "bulleted_list",
    "numbered_list",
    "to_do",
    "quote",
    "callout",
    "code",
  ] as const) {
    assert.equal(opens({ type }), false, `${type} must not open AI`);
  }
});

test("a paragraph with text keeps typing a space", () => {
  assert.equal(opens({ isEmpty: false }), false);
});

test("a read-only surface keeps the plain space", () => {
  assert.equal(opens({ editable: false }), false);
});

test("without the AI service Space types a space, as today", () => {
  assert.equal(opens({ aiConfigured: false }), false);
});
