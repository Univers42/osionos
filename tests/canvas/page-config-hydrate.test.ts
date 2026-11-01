// A page's settings saved from one browser reach another (#253).

import assert from "node:assert/strict";
import test from "node:test";

import { mergeServerPageConfig, resolvePageConfig } from "../../src/shared/config/pageConfigStore.ts";

test("server settings apply over a browser that has none", () => {
  const merged = mergeServerPageConfig(undefined, { fullWidth: true, showProperties: false });
  assert.equal(merged?.fullWidth, true);
  assert.equal(merged?.showProperties, false);
});

test("an empty server row changes nothing", () => {
  assert.equal(mergeServerPageConfig(resolvePageConfig(undefined), {}), null);
  assert.equal(mergeServerPageConfig(undefined, null), null);
});

test("settings equal to the local copy write nothing", () => {
  const local = resolvePageConfig(undefined, { fullWidth: true });
  assert.equal(mergeServerPageConfig(local, { fullWidth: true }), null);
});

test("local version snapshots survive a server read", () => {
  const local = { ...resolvePageConfig(undefined), versions: [{ id: "v1" }] } as never;
  const merged = mergeServerPageConfig(local, { smallText: true });
  assert.equal((merged as unknown as { versions: unknown[] }).versions.length, 1);
});
