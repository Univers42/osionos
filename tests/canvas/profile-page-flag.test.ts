// ADR 0067 PH1/PH2: osio.profile.page falls back to false, and a production build decides it
// from its env alone, so `?osio.profile.page=1` or the localStorage key cannot turn it on live.
// Dev and test builds (the e2e harness builds `--mode test`) keep the overrides, like RD5.

import assert from "node:assert/strict";
import test from "node:test";

import { bakeBuildEnv, setFlagOverride } from "./support/layout-modes-flag.ts";

bakeBuildEnv({});

const FLAG = "osio.profile.page";

async function build(env: Record<string, string>): Promise<() => boolean> {
  const flags = await import(`../../src/shared/config/featureFlags.ts?env=${encodeURIComponent(JSON.stringify(env))}`);
  return flags.isProfilePageEnabled as () => boolean;
}

test("a production build with the env unset ignores the URL and localStorage override", async () => {
  setFlagOverride(FLAG, "1");
  assert.equal((await build({ MODE: "production" }))(), false);
});

// Dockerfile.prod declares the build arg with an empty default, so a build that does not pass
// it bakes "" rather than leaving it unset.
test("a production build with the build arg's empty default is off, override or not", async () => {
  setFlagOverride(FLAG, "1");
  assert.equal((await build({ MODE: "production", VITE_OSIO_PROFILE_PAGE: "" }))(), false);
  setFlagOverride(FLAG, null);
});

test("a production build with VITE_OSIO_PROFILE_PAGE=1 is on, and an override cannot turn it off", async () => {
  setFlagOverride(FLAG, null);
  assert.equal((await build({ MODE: "production", VITE_OSIO_PROFILE_PAGE: "1" }))(), true);
  setFlagOverride(FLAG, "0");
  assert.equal((await build({ MODE: "production", VITE_OSIO_PROFILE_PAGE: "1" }))(), true);
});

test("a test-mode build honours the override, and is off without one", async () => {
  setFlagOverride(FLAG, "1");
  assert.equal((await build({ MODE: "test", PROD: "true" }))(), true);
  setFlagOverride(FLAG, null);
  assert.equal((await build({ MODE: "test" }))(), false);
});
