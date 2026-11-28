// The phone shell's stack reducer: push, pop, tab switches that keep each tab's stack, and a
// pop at a root that does nothing.

import assert from "node:assert/strict";
import test from "node:test";

import {
  currentStack,
  initialPhoneNav,
  phoneNavReducer,
  topPageId,
  type PhoneEntry,
} from "../../src/widgets/phone-shell/model/phoneStack.ts";

const page = (pageId: string): PhoneEntry => ({
  kind: "page",
  pageId,
  tab: { tabId: `tab-${pageId}`, pageId, workspaceId: "w1", kind: "page" },
});

test("starts on Home with every tab at its root", () => {
  const state = initialPhoneNav();
  assert.equal(state.tab, "home");
  assert.deepEqual(currentStack(state), [{ kind: "tab-root" }]);
});

test("push stacks a page and pop returns to the root", () => {
  const pushed = phoneNavReducer(initialPhoneNav(), { type: "push", entry: page("a") });
  assert.equal(topPageId(pushed), "a");
  assert.equal(currentStack(pushed).length, 2);
  const popped = phoneNavReducer(pushed, { type: "pop" });
  assert.equal(topPageId(popped), null);
  assert.equal(currentStack(popped).length, 1);
});

test("pop at a root is a no-op that keeps the same state object", () => {
  const state = initialPhoneNav();
  assert.equal(phoneNavReducer(state, { type: "pop" }), state);
});

test("the same page pushed twice in a row is one entry", () => {
  const once = phoneNavReducer(initialPhoneNav(), { type: "push", entry: page("a") });
  assert.equal(phoneNavReducer(once, { type: "push", entry: page("a") }), once);
  assert.equal(currentStack(phoneNavReducer(once, { type: "push", entry: page("b") })).length, 3);
});

test("switching tabs keeps each tab's stack", () => {
  let state = phoneNavReducer(initialPhoneNav(), { type: "push", entry: page("a") });
  state = phoneNavReducer(state, { type: "switch", tab: "search" });
  assert.equal(topPageId(state), null);
  state = phoneNavReducer(state, { type: "push", entry: page("b") });
  state = phoneNavReducer(state, { type: "switch", tab: "home" });
  assert.equal(topPageId(state), "a");
  assert.equal(topPageId(phoneNavReducer(state, { type: "switch", tab: "search" })), "b");
});

test("switching to the selected tab returns the same state", () => {
  const state = initialPhoneNav();
  assert.equal(phoneNavReducer(state, { type: "switch", tab: "home" }), state);
});

test("a shell mounted over an already open page starts Home on top of it", () => {
  const state = initialPhoneNav(page("open"));
  assert.equal(topPageId(state), "open");
  assert.equal(currentStack(phoneNavReducer(state, { type: "pop" })).length, 1);
});
