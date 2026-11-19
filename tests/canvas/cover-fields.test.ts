/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cover-fields.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The read-side validator for a page's cover layout (groot ADR 0064 PS27): every inbound
// path (server row, seed, .omd) goes through it, so a value that fails it never reaches a page.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COVER_HEIGHT_MAX,
  COVER_HEIGHT_MIN,
  readCoverFields,
  readCoverHeight,
  readCoverPosition,
  readCoverWidth,
} from "@/entities/page/model/coverFields";

const NOT_NUMBERS: unknown[] = [undefined, null, "300", "", true, {}, [], [300], NaN, Infinity, -Infinity];

test("cover height: an integer inside 120–640 is kept as is", () => {
  for (const height of [COVER_HEIGHT_MIN, 121, 280, 639, COVER_HEIGHT_MAX]) {
    assert.equal(readCoverHeight(height), height);
  }
});

test("cover height: out of range is clamped, a fraction is rounded to an integer", () => {
  assert.equal(readCoverHeight(0), COVER_HEIGHT_MIN);
  assert.equal(readCoverHeight(-5000), COVER_HEIGHT_MIN);
  assert.equal(readCoverHeight(641), COVER_HEIGHT_MAX);
  assert.equal(readCoverHeight(Number.MAX_VALUE), COVER_HEIGHT_MAX);
  assert.equal(readCoverHeight(300.4), 300);
  assert.equal(readCoverHeight(300.5), 301);
  assert.equal(readCoverHeight(119.6), COVER_HEIGHT_MIN);
});

test("cover height: anything that is not a finite number is dropped", () => {
  for (const value of NOT_NUMBERS) assert.equal(readCoverHeight(value), undefined, String(value));
});

test("cover height: every finite input lands on an integer in range (sweep)", () => {
  for (let raw = -2000; raw <= 2000; raw += 0.37) {
    const height = readCoverHeight(raw);
    assert.ok(Number.isInteger(height), `${raw} → ${height}`);
    assert.ok(height! >= COVER_HEIGHT_MIN && height! <= COVER_HEIGHT_MAX, `${raw} → ${height}`);
  }
});

test("cover width: only full and content are read, anything else is dropped", () => {
  assert.equal(readCoverWidth("full"), "full");
  assert.equal(readCoverWidth("content"), "content");
  for (const value of [...NOT_NUMBERS, "Full", " full", "wide", "content ", 1]) {
    assert.equal(readCoverWidth(value), undefined, String(value));
  }
});

test("cover position: today's semantics, a finite 0–100 is kept and the rest dropped", () => {
  for (const position of [0, 12.5, 50, 100]) assert.equal(readCoverPosition(position), position);
  for (const value of [...NOT_NUMBERS, -0.1, 100.1, "50"]) {
    assert.equal(readCoverPosition(value), undefined, String(value));
  }
});

test("readCoverFields returns only the valid keys, so an absent or bad key adds nothing", () => {
  assert.deepEqual(readCoverFields({}), {});
  assert.deepEqual(Object.keys(readCoverFields({ coverHeight: "x", coverWidth: "wide" })), []);
  assert.deepEqual(
    readCoverFields({ coverPosition: 30, coverHeight: 9000, coverWidth: "content" }),
    { coverPosition: 30, coverHeight: COVER_HEIGHT_MAX, coverWidth: "content" },
  );
  assert.deepEqual(readCoverFields({ coverWidth: "full", title: "ignored" }), { coverWidth: "full" });
});
