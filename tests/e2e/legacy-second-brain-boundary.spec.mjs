// The build-time gate covers the legacy second brain only if nothing outside the
// legacy folders imports it except through the gated boundary. Pure file checks.

import { expect, test } from "@playwright/test";

import { ALLOWED_IMPORTS, legacyImportersOutside } from "./support/legacySecondBrainBoundary.mjs";

test("legacy second-brain code is imported only through the gated boundary", () => {
  const sorted = Object.fromEntries(Object.entries(ALLOWED_IMPORTS).map(([file, specs]) => [file, [...specs].sort()]));
  expect(legacyImportersOutside(new URL("../../", import.meta.url))).toEqual(sorted);
});
