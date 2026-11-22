// RP5 (groot ADR 0067): no test passes an async predicate to waitForFunction. An async
// predicate returns a Promise, which is always truthy, so the wait passes at once and the
// test asserts on a page that is not ready. Read the store synchronously instead.
// A canvas scan, not an eslint rule: `npm run lint` covers src/ packages/ scripts/ only.
//
// Caveat: a source scan of the call's first argument. A predicate defined elsewhere and
// passed by name, one built by a helper, or a sync function returning a Promise is not seen
// (under-reports). Only files under tests/ with a JS/TS extension are read.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const TESTS = new URL("../", import.meta.url);
const SOURCE = /\.[cm]?[jt]sx?$/;
const ASYNC_PREDICATE = /waitForFunction\s*\(\s*async\b/g;

function asyncPredicateLines(source: string): number[] {
  return [...source.matchAll(ASYNC_PREDICATE)].map((match) => source.slice(0, match.index).split("\n").length);
}

test("the matcher flags async arrows and async functions, not sync predicates", () => {
  const call = (predicate: string) => ["page.waitForFunction(", predicate, ")"].join("");
  assert.deepEqual(asyncPredicateLines(call("async () => true")), [1]);
  assert.deepEqual(asyncPredicateLines(call("\n  async function ready() { return true; }")), [1]);
  assert.deepEqual(asyncPredicateLines(call("() => Boolean(window.ready)")), []);
  assert.deepEqual(asyncPredicateLines(call("asyncReady")), []);
});

test("no file under tests/ passes an async predicate to waitForFunction", () => {
  const files = readdirSync(TESTS, { recursive: true, encoding: "utf8" })
    .filter((file) => SOURCE.test(file) && !file.split("/").includes("node_modules"));
  const offenders = files.flatMap((file) =>
    asyncPredicateLines(readFileSync(new URL(file, TESTS), "utf8")).map((line) => `tests/${file}:${line}`));
  assert.deepEqual(offenders, [], `async waitForFunction predicates (always truthy):\n${offenders.join("\n")}`);
});
