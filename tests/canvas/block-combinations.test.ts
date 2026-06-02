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

// Each heading level maps to a distinct, increasingly large text size so the
// summary of a container reads like the heading it stands in for.
test("getToggleHeadingClass sizes each level distinctly and larger toward 1", () => {
  assert.match(getToggleHeadingClass(1), /text-2xl/);
  assert.match(getToggleHeadingClass(2), /text-xl/);
  assert.match(getToggleHeadingClass(3), /text-lg/);
  assert.match(getToggleHeadingClass(4), /text-base/);
  assert.match(getToggleHeadingClass(5), /text-sm/);
  assert.match(getToggleHeadingClass(6), /text-sm/);
});

test("getToggleHeadingClass falls back to text-sm with no heading level", () => {
  assert.match(getToggleHeadingClass(undefined), /text-sm/);
});
