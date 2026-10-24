// C1.1: the browser's IANA zone reaches the shell exec Env only, validated, else UTC.
import test from "node:test";
import assert from "node:assert/strict";
import { buildShellExecSpec, buildContainerSpec, normalizeTimeZone } from "../../scripts/ide-sandbox-spec.mjs";

const tzEntries = (spec) => spec.Env.filter((e) => e.startsWith("TZ="));

test("a valid zone becomes one TZ entry on login and safe shells", () => {
  assert.deepEqual(tzEntries(buildShellExecSpec({ tz: "Europe/Paris" })), ["TZ=Europe/Paris"]);
  assert.deepEqual(tzEntries(buildShellExecSpec({ safe: true, tz: "America/Argentina/Buenos_Aires" })), ["TZ=America/Argentina/Buenos_Aires"]);
  assert.deepEqual(tzEntries(buildShellExecSpec({ tz: "Etc/GMT+5" })), ["TZ=Etc/GMT+5"]);
});

test("an absent zone adds no TZ entry; an invalid one is UTC", () => {
  assert.deepEqual(tzEntries(buildShellExecSpec({})), []);
  for (const bad of ["", "a b", "x;rm -rf", "Europe/Paris\nFOO=1", "é", "A".repeat(65), "$(id)", "../..", 5]) {
    assert.deepEqual(tzEntries(buildShellExecSpec({ tz: bad })), ["TZ=UTC"], JSON.stringify(bad));
  }
  assert.equal(normalizeTimeZone(null), null);
});

test("the create Env never carries a TZ", () => {
  const spec = buildContainerSpec({ userId: "u", workspaceId: "w", image: "i", sandboxNet: "n", volumeName: "v", uid: 20000 });
  assert.deepEqual((spec.Env ?? []).filter((e) => e.startsWith("TZ=")), []);
});
