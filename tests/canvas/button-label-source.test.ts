/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   button-label-source.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: DJSurgeon <djsurgeon83@gmail.com>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/02 19:25:00 by DJSurgeon         #+#    #+#             */
/*   Updated: 2026/11/02 19:25:00 by DJSurgeon        ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { buttonBlockLabel } from "../../src/entities/block/model/buttonBlock.ts";
import { buttonBlockLabel as buttonBlockLabelFromIndex } from "../../src/entities/block/index.ts";

test("buttonBlockLabel returns canonical content", () => {
  assert.equal(buttonBlockLabel({ content: "Launch" }), "Launch");
});

test("buttonBlockLabel falls back to legacy buttonLabel", () => {
  assert.equal(buttonBlockLabel({ buttonLabel: "Legacy Go" }), "Legacy Go");
});

test("buttonBlockLabel prefers canonical content over legacy buttonLabel", () => {
  assert.equal(buttonBlockLabel({ content: "Primary", buttonLabel: "Legacy" }), "Primary");
});

test("buttonBlockLabel returns 'Button' for empty object", () => {
  assert.equal(buttonBlockLabel({}), "Button");
});

test("buttonBlockLabel returns 'Button' for null and undefined", () => {
  assert.equal(buttonBlockLabel(null), "Button");
  assert.equal(buttonBlockLabel(undefined), "Button");
});

test("buttonBlockLabel falls back to buttonLabel when content is whitespace", () => {
  assert.equal(buttonBlockLabel({ content: "   ", buttonLabel: "Fallback" }), "Fallback");
});

test("buttonBlockLabel returns 'Button' when both content and buttonLabel are whitespace", () => {
  assert.equal(buttonBlockLabel({ content: "   ", buttonLabel: "   " }), "Button");
});

test("buttonBlockLabel is re-exported from entities/block/index.ts", () => {
  assert.equal(typeof buttonBlockLabelFromIndex, "function");
  assert.equal(buttonBlockLabel, buttonBlockLabelFromIndex);
});
