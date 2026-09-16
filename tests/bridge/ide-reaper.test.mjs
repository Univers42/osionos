// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-reaper.test.mjs                                :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

import test from "node:test";
import assert from "node:assert/strict";

import { shouldReapSandbox } from "../../scripts/bridge-ide-sandbox.mjs";

const HOUR = 60 * 60 * 1000;
const SOFT = 4 * HOUR;
const HARD = 12 * HOUR;
const NOW = 1_800_000_000_000;
const box = (ageMs, running = true) => ({ running, createdSec: (NOW - ageMs) / 1000 });

test("young sandboxes survive, active or not", () => {
  assert.equal(shouldReapSandbox(box(1 * HOUR), NOW, SOFT, HARD, false), false);
  assert.equal(shouldReapSandbox(box(1 * HOUR), NOW, SOFT, HARD, true), false);
});

test("past the soft lifetime an IDLE sandbox is reaped", () => {
  assert.equal(shouldReapSandbox(box(5 * HOUR), NOW, SOFT, HARD, false), true);
});

test("past the soft lifetime an ACTIVE sandbox survives — no mid-terminal guillotine", () => {
  assert.equal(shouldReapSandbox(box(5 * HOUR), NOW, SOFT, HARD, true), false);
});

test("the hard cap reaps even an active sandbox", () => {
  assert.equal(shouldReapSandbox(box(13 * HOUR), NOW, SOFT, HARD, true), true);
});

test("stopped containers are never reap candidates", () => {
  assert.equal(shouldReapSandbox(box(13 * HOUR, false), NOW, SOFT, HARD, false), false);
});
