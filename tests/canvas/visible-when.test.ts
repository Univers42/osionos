/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   visible-when.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test, { before } from "node:test";
import "./support/user-store-env.ts";

import { evaluateCellVisibility, visibleForSnapshot, isVisibleResult } from "../../src/entities/block/model/visibility.ts";
import { createPagePropertiesScope } from "../../src/entities/block/model/visibilityScope.ts";
import {
  FORMULA_ENGINE_UNAVAILABLE,
  initFormulaEngine,
  isWasmReady,
  validateFormula,
} from "../../src/shared/notion-database-sys/src/lib/engine/bridge.ts";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");

before(async () => {
  const originalFetch = globalThis.fetch;
  (globalThis as Record<string, unknown>).__OBJECT_DATABASE_DISABLE_WASM__ = false;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("file:")) {
      const bytes = await readFile(fileURLToPath(url));
      return new Response(bytes, { headers: { "content-type": "application/wasm" } });
    }
    return originalFetch(input as never);
  }) as typeof fetch;
  try {
    assert.equal(await initFormulaEngine(), true, "the formula engine must boot");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(isWasmReady(), true);
});

function makePage(properties: { key: string; value: unknown }[]) {
  return {
    _id: "p1",
    workspaceId: "w",
    ownerId: "u",
    title: "P",
    content: [],
    properties: properties.map((p) => ({ key: p.key, label: p.key, value: p.value })),
  } as never;
}

function seedPage(properties: { key: string; value: unknown }[]) {
  const page = makePage(properties);
  Reflect.set(globalThis, "__playgroundUserStore", {
    getState: () => ({ activeSession: () => ({ userId: "u", privateWorkspaces: [{ _id: "w", role: "owner", permissions: ["read", "update"] }], sharedWorkspaces: [] }) }),
  });
  usePageStore.setState({ ...derivePageState({ w: [page] }), pageRevisions: {} } as never);
}

test("evaluateCellVisibility is reachable from the moved module", () => {
  assert.equal(evaluateCellVisibility('prop("status") == "active"', { status: "active" }), true);
  assert.equal(evaluateCellVisibility('prop("status") == "active"', { status: "done" }), false);
});

test("fail open: engine-unavailable, compile error, and falsy results", () => {
  assert.equal(
    evaluateCellVisibility('prop("status") == "active"', { status: "done" }, () => FORMULA_ENGINE_UNAVAILABLE),
    true,
  );
  assert.equal(evaluateCellVisibility('prop("status") == ', { status: "active" }), true);
  assert.equal(evaluateCellVisibility('prop("x")', { x: false }), false);
  assert.equal(evaluateCellVisibility('prop("x")', { x: 0 }), false);
  assert.equal(evaluateCellVisibility('prop("x")', { x: "" }), false);
  assert.equal(evaluateCellVisibility('prop("x")', { x: null }), false);
});

test("createPagePropertiesScope read returns the same object when an unrelated key changes", () => {
  seedPage([{ key: "a", value: 1 }, { key: "b", value: 2 }]);
  const scope = createPagePropertiesScope("p1");
  const first = scope.read(["a"]);
  // unrelated b changes
  seedPage([{ key: "a", value: 1 }, { key: "b", value: 99 }]);
  const second = scope.read(["a"]);
  assert.equal(first, second);
});

test("createPagePropertiesScope read returns a new object when a changes", () => {
  seedPage([{ key: "a", value: 1 }, { key: "b", value: 2 }]);
  const scope = createPagePropertiesScope("p1");
  const first = scope.read(["a"]);
  seedPage([{ key: "a", value: 7 }, { key: "b", value: 2 }]);
  const second = scope.read(["a"]);
  assert.notEqual(first, second);
  assert.equal((second as { a: unknown }).a, 7);
});

test("validateFormula reports invalid formula", () => {
  const result = validateFormula("prop(");
  assert.equal(result.ok, false);
});

test("scope caches per key list (item 1)", () => {
  seedPage([{ key: "a", value: 1 }, { key: "b", value: 2 }]);
  const scope = createPagePropertiesScope("p1");
  const firstA = scope.read(["a"]);
  const firstB = scope.read(["b"]);
  const secondA = scope.read(["a"]);
  assert.equal(firstA, secondA);
  seedPage([{ key: "a", value: 7 }, { key: "b", value: 2 }]);
  const thirdA = scope.read(["a"]);
  assert.notEqual(firstA, thirdA);
  const stillB = scope.read(["b"]);
  assert.equal(firstB, stillB);
});

test("isVisibleResult is the single truthiness rule (item 2)", () => {
  assert.equal(isVisibleResult(FORMULA_ENGINE_UNAVAILABLE), true);
  assert.equal(isVisibleResult(false), false);
  assert.equal(isVisibleResult(0), false);
  assert.equal(isVisibleResult(""), false);
  assert.equal(isVisibleResult(null), false);
  assert.equal(isVisibleResult(true), true);
  assert.equal(isVisibleResult(1), true);
  const fakeScope = {
    read: () => ({ x: 1 }),
    subscribe: () => () => {},
  } as never;
  for (const value of [false, 0, "", null, undefined]) {
    const snapshot = { x: value };
    const scope = { read: () => snapshot, subscribe: () => () => {} } as never;
    assert.equal(visibleForSnapshot(scope, 'prop("x")', snapshot, () => value), false, String(value));
  }
  for (const value of [FORMULA_ENGINE_UNAVAILABLE, true, 1]) {
    const snapshot = { x: value };
    const scope = { read: () => snapshot, subscribe: () => () => {} } as never;
    assert.equal(visibleForSnapshot(scope, 'prop("x")', snapshot, () => value), true, String(value));
  }
  void fakeScope;
});

test("evaluation counter: one eval first read, zero on unrelated change, one on a change (item 3)", () => {
  let evaluations = 0;
  const evaluate = (props: { a?: unknown }) => {
    evaluations += 1;
    return props.a;
  };
  seedPage([{ key: "a", value: 1 }, { key: "b", value: 2 }]);
  const scope = createPagePropertiesScope("p1");
  const first = visibleForSnapshot(scope, 'prop("a")', scope.read(["a"]), evaluate as never);
  assert.equal(evaluations, 1);
  assert.equal(first, true);
  seedPage([{ key: "a", value: 1 }, { key: "b", value: 99 }]);
  const second = visibleForSnapshot(scope, 'prop("a")', scope.read(["a"]), evaluate as never);
  assert.equal(evaluations, 1);
  assert.equal(second, first);
  seedPage([{ key: "a", value: 0 }, { key: "b", value: 99 }]);
  const third = visibleForSnapshot(scope, 'prop("a")', scope.read(["a"]), evaluate as never);
  assert.equal(evaluations, 2);
  assert.equal(third, false);
});