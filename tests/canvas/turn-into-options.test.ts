/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   turn-into-options.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The selection toolbar's Turn-into list: the supported block types, in order,
// with an icon and a preview type for every row.

import assert from "node:assert/strict";
import test from "node:test";

import {
  TURN_INTO_LABEL_BY_TYPE,
  TURN_INTO_OPTIONS,
  turnIntoLabel,
} from "@/components/blocks/selection-toolbar/turnIntoOptions";

const REQUIRED = [
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list",
  "to_do",
  "quote",
  "callout",
  "code",
] as const;

test("the Turn-into list holds the required block types", () => {
  const types = TURN_INTO_OPTIONS.map((option) => option.type);
  for (const type of REQUIRED) {
    assert.ok(types.includes(type), `missing ${type}`);
  }
  assert.equal(new Set(types).size, types.length, "duplicate block type");
});

test("every option has an icon, a label and a preview type", () => {
  for (const option of TURN_INTO_OPTIONS) {
    assert.ok(option.icon, `${option.type} has no icon`);
    assert.ok(option.label.length > 0, `${option.type} has no label`);
    assert.ok(option.previewType, `${option.type} has no preview type`);
  }
});

test("the current block type's label is the trigger label", () => {
  assert.equal(turnIntoLabel("paragraph"), "Text");
  assert.equal(turnIntoLabel("heading_1"), "Heading 1");
  assert.equal(turnIntoLabel("unknown"), "Text");
  assert.equal(TURN_INTO_LABEL_BY_TYPE.get("quote"), "Quote");
});
