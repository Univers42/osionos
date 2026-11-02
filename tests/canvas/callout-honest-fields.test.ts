/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   callout-honest-fields.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: DJSurgeon <djsurgeon83@gmail.com>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/02 18:35:00 by DJSurgeon         #+#    #+#             */
/*   Updated: 2026/11/02 18:35:00 by DJSurgeon        ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { resolveCalloutProps } from "../../src/entities/block/model/calloutTypes.ts";
import { resolveCalloutProps as resolveCalloutPropsFromIndex } from "../../src/entities/block/index.ts";

test("resolveCalloutProps returns honest icon and tone when both provided", () => {
  const result = resolveCalloutProps({ calloutIcon: "⚠️", calloutTone: "orange" });
  assert.equal(result.icon, "⚠️");
  assert.equal(result.tone, "orange");
  assert.equal(result.type.tone, "orange");
});

test("resolveCalloutProps resolves legacy emoji in color fallback", () => {
  const result = resolveCalloutProps({ color: "⚠️" });
  assert.equal(result.icon, "⚠️");
  assert.equal(result.tone, "orange");
  assert.equal(result.type.tone, "orange");
});

test("resolveCalloutProps resolves legacy kind word in color fallback", () => {
  const result = resolveCalloutProps({ color: "warning" });
  assert.equal(result.icon, "⚠️");
  assert.equal(result.tone, "orange");
  assert.equal(result.type.id, "warning");
});

test("resolveCalloutProps resolves legacy tip emoji in color fallback", () => {
  const result = resolveCalloutProps({ color: "💡" });
  assert.equal(result.icon, "💡");
  assert.equal(result.tone, "yellow");
  assert.equal(result.type.tone, "yellow");
});

test("resolveCalloutProps returns note default when no fields provided", () => {
  const result = resolveCalloutProps({});
  assert.equal(result.icon, "📝");
  assert.equal(result.tone, "gray");
  assert.equal(result.type.id, "note");
});

test("resolveCalloutProps supports custom emoji with explicit tone", () => {
  const result = resolveCalloutProps({ calloutIcon: "🚀", calloutTone: "purple" });
  assert.equal(result.icon, "🚀");
  assert.equal(result.tone, "purple");
  assert.equal(result.type.tone, "purple");
});

test("resolveCalloutProps with custom emoji and no tone defaults to gray note tone", () => {
  const result = resolveCalloutProps({ calloutIcon: "🚀" });
  assert.equal(result.icon, "🚀");
  assert.equal(result.tone, "gray");
  assert.equal(result.type.tone, "gray");
});

test("resolveCalloutProps supports lucide icon values with explicit tone", () => {
  const result = resolveCalloutProps({ calloutIcon: "icon:shield", calloutTone: "blue" });
  assert.equal(result.icon, "icon:shield");
  assert.equal(result.tone, "blue");
  assert.equal(result.type.tone, "blue");
});

test("resolveCalloutProps is exported from index.ts matching model/calloutTypes.ts", () => {
  assert.equal(typeof resolveCalloutPropsFromIndex, "function");
  assert.equal(resolveCalloutProps, resolveCalloutPropsFromIndex);
});
