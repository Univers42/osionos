/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   height-resize-grip.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { resizedHeight } from "@/shared/lib/dom/useHeightResizeGrip.ts";

test("resizedHeight adds the drag distance and rounds", () => {
  assert.equal(resizedHeight(400, 100, 240), 500);
  assert.equal(resizedHeight(400, 10.6, 240), 411);
});

test("resizedHeight never goes under the minimum", () => {
  assert.equal(resizedHeight(400, -1000, 240), 240);
});

test("resizedHeight honours an optional maximum and is unbounded without one", () => {
  assert.equal(resizedHeight(400, 5000, 240, 1600), 1600);
  assert.equal(resizedHeight(400, 5000, 240), 5400);
});
