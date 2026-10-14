/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-debug-store.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { useDebugStore } from "../../src/features/ide/model/debugStore.ts";

// The debug store alone: breakpoints are keyed by untrusted workspace paths and the
// output feed is capped in lines, both independent of any adapter.

test("toggleBreakpoint adds, sorts and removes a line; an emptied file is dropped", () => {
  const store = useDebugStore.getState();
  useDebugStore.setState({ breakpoints: {} });
  store.toggleBreakpoint("app.py", 9);
  store.toggleBreakpoint("app.py", 3);
  assert.deepEqual(useDebugStore.getState().breakpoints["app.py"], [3, 9]);
  store.toggleBreakpoint("app.py", 3);
  store.toggleBreakpoint("app.py", 5);
  assert.deepEqual(useDebugStore.getState().breakpoints["app.py"], [5, 9]);
  store.toggleBreakpoint("app.py", 9);
  store.toggleBreakpoint("app.py", 5);
  assert.deepEqual(useDebugStore.getState().breakpoints, {});
});

test("debug output is capped at 500 lines, the oldest dropped first", () => {
  useDebugStore.getState().reset();
  for (let i = 0; i < 505; i += 1) useDebugStore.getState().appendOutput(`line ${i}`);
  const output = useDebugStore.getState().output;
  assert.equal(output.length, 500);
  assert.equal(output[0], "line 5");
  assert.equal(output[499], "line 504");
});

test("toggleBreakpoint ignores a non-line and keeps an inherited-looking file name as an own key", () => {
  useDebugStore.setState({ breakpoints: {} });
  const store = useDebugStore.getState();
  store.toggleBreakpoint("app.py", 0);
  store.toggleBreakpoint("app.py", 2.5);
  store.toggleBreakpoint("__proto__", 1);
  store.toggleBreakpoint("toString", 4);
  assert.deepEqual(useDebugStore.getState().breakpoints, { toString: [4] });
  assert.equal(Object.getPrototypeOf(useDebugStore.getState().breakpoints), Object.prototype);
});

test("one output event carrying several lines counts each line toward the cap", () => {
  useDebugStore.getState().reset();
  useDebugStore.getState().appendOutput("a\r\nb\nc");
  useDebugStore.getState().appendOutput("");
  assert.deepEqual(useDebugStore.getState().output, ["a", "b", "c"]);
});
