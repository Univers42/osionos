// ADR 0067 PH2: a flag ruled live-BLOCKED must not be reachable from a URL or localStorage
// override in a live build. The ordinary resolver honours both; the env-only accessor must not.

import assert from "node:assert/strict";
import test from "node:test";

const { isFeatureFlagEnabled, isEnvOnlyFlagEnabled, isProfilePageEnabled } = await import(
  "../../src/shared/config/featureFlags.ts"
);

const FLAG = "osio.profile.page";

function withOverrides(search: string, stored: Record<string, string>, run: () => void): void {
  const win = {
    location: { search, hash: "" },
    localStorage: { getItem: (key: string) => stored[key] ?? null },
  };
  (globalThis as { window?: unknown }).window = win;
  try {
    run();
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
}

test("a URL override turns the ordinary resolver on but never the env-only flag", () => {
  withOverrides(`?${FLAG}=1`, {}, () => {
    assert.equal(isFeatureFlagEnabled(FLAG), true, "control: the URL tier is live");
    assert.equal(isEnvOnlyFlagEnabled(FLAG, false, {}), false);
    assert.equal(isProfilePageEnabled(), false);
  });
});

test("a localStorage override never turns the env-only flag on", () => {
  withOverrides("", { [FLAG]: "1", VITE_OSIO_PROFILE_PAGE: "1" }, () => {
    assert.equal(isFeatureFlagEnabled(FLAG), true, "control: the storage tier is live");
    assert.equal(isEnvOnlyFlagEnabled(FLAG, false, {}), false);
    assert.equal(isProfilePageEnabled(), false);
  });
});

test("only the build env turns it on, and only with a true value", () => {
  assert.equal(isEnvOnlyFlagEnabled(FLAG, false, { VITE_OSIO_PROFILE_PAGE: "1" }), true);
  assert.equal(isEnvOnlyFlagEnabled(FLAG, false, { VITE_OSIO_PROFILE_PAGE: "true" }), true);
  assert.equal(isEnvOnlyFlagEnabled(FLAG, false, { VITE_OSIO_PROFILE_PAGE: "0" }), false);
  assert.equal(isEnvOnlyFlagEnabled(FLAG, false, { VITE_OSIO_PROFILE_PAGE: 1 }), false, "a non-string is not a build value");
  assert.equal(isEnvOnlyFlagEnabled(FLAG, false, {}), false);
});

test("the publish containers flag is env-only too (ADR 0067 PH2)", async () => {
  const { isPublishContainersEnabled } = await import("../../src/shared/config/featureFlags.ts");
  withOverrides("?osio.publish.containers=1", { "osio.publish.containers": "1" }, () => {
    assert.equal(isPublishContainersEnabled(), false);
  });
});
