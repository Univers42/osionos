/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markengine-shortcuts.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { detectBlockType } from "../../src/shared/lib/markengine/shortcutsDetect.ts";

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const hashes = (level: number) => "#".repeat(level);

test("every heading level detects from '#'.. + space", () => {
  for (const level of HEADING_LEVELS) {
    const detection = detectBlockType(`${hashes(level)} Title ${level}`);
    assert.equal(detection?.type, `heading_${level}`);
    assert.equal(detection?.content, `Title ${level}`);
    assert.equal(detection?.headingLevel, undefined);
  }
});

test("toggle detects from '> ' without a heading level", () => {
  const detection = detectBlockType("> collapse me");
  assert.equal(detection?.type, "toggle");
  assert.equal(detection?.content, "collapse me");
  assert.equal(detection?.headingLevel, undefined);
});

test("toggle-heading detects from the compact '#>' form at every level", () => {
  for (const level of HEADING_LEVELS) {
    const detection = detectBlockType(`${hashes(level)}> Heading toggle`);
    assert.equal(detection?.type, "toggle", `level ${level} type`);
    assert.equal(detection?.headingLevel, level, `level ${level} headingLevel`);
    assert.equal(detection?.content, "Heading toggle");
  }
});

test("toggle-heading detects from the Notion '> #' form at every level", () => {
  for (const level of HEADING_LEVELS) {
    const detection = detectBlockType(`> ${hashes(level)} Heading toggle`);
    assert.equal(detection?.type, "toggle", `level ${level} type`);
    assert.equal(detection?.headingLevel, level, `level ${level} headingLevel`);
    assert.equal(detection?.content, "Heading toggle");
  }
});

test("compact toggle-heading works with no content and extra spaces", () => {
  for (const level of HEADING_LEVELS) {
    assert.equal(detectBlockType(`${hashes(level)}>`)?.headingLevel, level);
    assert.equal(detectBlockType(`${hashes(level)}>   spaced`)?.content, "spaced");
  }
});

test("quote detects from '\"' and '|'", () => {
  assert.equal(detectBlockType('" quoted')?.type, "quote");
  assert.equal(detectBlockType("| quoted")?.type, "quote");
  assert.equal(detectBlockType('" quoted')?.content, "quoted");
});

test("to-do detects every checkbox prefix variant with correct checked state", () => {
  const cases: Array<[string, boolean]> = [
    ["- [ ] a", false], ["- [] a", false], ["- [x] a", true], ["- [X] a", true],
    ["* [ ] a", false], ["* [x] a", true], ["+ [ ] a", false], ["+ [x] a", true],
    ["[ ] a", false], ["[] a", false], ["[x] a", true], ["[X] a", true],
  ];
  for (const [input, checked] of cases) {
    const detection = detectBlockType(input);
    assert.equal(detection?.type, "to_do", `${input} type`);
    assert.equal(detection?.checked, checked, `${input} checked`);
    assert.equal(detection?.content, "a", `${input} content`);
  }
});

test("lists detect from bullet and ordered markers", () => {
  for (const marker of ["-", "*", "+"]) {
    assert.equal(detectBlockType(`${marker} item`)?.type, "bulleted_list");
  }
  for (const sep of [".", ")"]) {
    const detection = detectBlockType(`1${sep} item`);
    assert.equal(detection?.type, "numbered_list");
    assert.equal(detection?.content, "item");
  }
  assert.equal(detectBlockType("42. item")?.type, "numbered_list");
});

test("code fence detects language (or plaintext) and rejects unsafe langs", () => {
  assert.deepEqual(
    [detectBlockType("```ts")?.type, detectBlockType("```ts")?.language],
    ["code", "ts"],
  );
  assert.equal(detectBlockType("```")?.language, "plaintext");
  assert.equal(detectBlockType("```c++")?.language, "c++");
  assert.equal(detectBlockType("```rust lang")?.type ?? null, null); // space -> unsafe
});

test("divider detects from 3+ repeated -, *, _", () => {
  for (const input of ["---", "***", "___", "-----", "******"]) {
    assert.equal(detectBlockType(input)?.type, "divider", input);
  }
});

test("equation and callout detect", () => {
  assert.equal(detectBlockType("$$")?.type, "equation");
  const callout = detectBlockType(">![warning] heads up");
  assert.equal(callout?.type, "callout");
  assert.equal(callout?.kind, "warning");
  assert.equal(callout?.content, "heads up");
});

test("non-shortcut and incomplete prefixes return null (no false positives)", () => {
  for (const input of ["plain text", "#nospace", ">nospace", "-nospace", "##", "$", "`"]) {
    assert.equal(detectBlockType(input), null, `"${input}" should not match`);
  }
});

test("ordered-list detection is space-optional (engine converts '1.x')", () => {
  assert.equal(detectBlockType("1.nospace")?.type, "numbered_list");
  assert.equal(detectBlockType("1)nospace")?.type, "numbered_list");
});

test("toggle-heading is detected before a plain heading or plain toggle", () => {
  // Priority: "##> x" must be toggle+level, not heading_2, not bare toggle.
  const detection = detectBlockType("##> x");
  assert.equal(detection?.type, "toggle");
  assert.equal(detection?.headingLevel, 2);
});
