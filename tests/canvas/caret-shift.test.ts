/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caret-shift.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { shiftOffsetsForTextChange } from "../../src/shared/lib/editor-input/caretShift.ts";

test("a caret after the rewritten text moves by the length difference", () => {
  const previous = "see example.com";
  const next = "see Example Domain page";
  assert.deepEqual(shiftOffsetsForTextChange({ start: 15, end: 15 }, previous, next), { start: 23, end: 23 });
});

test("a caret before the rewritten text stays", () => {
  assert.deepEqual(shiftOffsetsForTextChange({ start: 2, end: 2 }, "see example.com now", "see Title now"), { start: 2, end: 2 });
});

test("a caret after a shortened text moves back", () => {
  assert.deepEqual(shiftOffsetsForTextChange({ start: 19, end: 19 }, "see example.com now", "see T now"), { start: 9, end: 9 });
});

test("identical text returns the offsets unchanged", () => {
  const offsets = { start: 3, end: 5 };
  assert.equal(shiftOffsetsForTextChange(offsets, "abcdef", "abcdef"), offsets);
});

test("a selection ending after the change keeps its start and moves its end", () => {
  assert.deepEqual(shiftOffsetsForTextChange({ start: 1, end: 14 }, "a example.com z", "a Title z"), { start: 1, end: 8 });
});

test("a caret at the end of a block whose last word was retitled stays at the end", () => {
  const previous = "see example.com";
  const next = "see Title";
  assert.deepEqual(shiftOffsetsForTextChange({ start: previous.length, end: previous.length }, previous, next), { start: next.length, end: next.length });
});
