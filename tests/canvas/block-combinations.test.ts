/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   block-combinations.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { acceptsHeadingLevel } from "../../src/entities/block/model/blockCategories.ts";
import { getToggleHeadingClass } from "../../src/entities/block/model/toggleHeading.ts";

// The collapsible containers can all carry a heading level — this is what makes
// "toggle heading", "quote heading" and "callout heading" combine.
test("acceptsHeadingLevel is true for every collapsible container", () => {
  for (const type of ["toggle", "quote", "callout"] as const) {
    assert.equal(acceptsHeadingLevel(type), true, `${type} should accept a heading level`);
  }
});

test("acceptsHeadingLevel is false for non-container blocks", () => {
  for (const type of [
    "paragraph",
    "heading_1",
    "bulleted_list",
    "numbered_list",
    "to_do",
    "code",
    "divider",
    "column",
  ] as const) {
    assert.equal(acceptsHeadingLevel(type), false, `${type} should not accept a heading level`);
  }
});

// Levels 1-4 come from the shared heading utilities (tests/canvas/toggle-heading.test.ts);
// 5 and 6 are too small to be a heading and keep the UI text.
test("getToggleHeadingClass keeps levels 5 and 6 at the UI text size", () => {
  assert.match(getToggleHeadingClass(5), /text-sm/);
  assert.match(getToggleHeadingClass(6), /text-sm/);
});

test("getToggleHeadingClass falls back to text-sm with no heading level", () => {
  assert.match(getToggleHeadingClass(undefined), /text-sm/);
});
