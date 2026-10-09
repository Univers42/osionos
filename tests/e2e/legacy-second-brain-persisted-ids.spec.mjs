// Guard for the legacy-* rename: every persisted id of the second brain is still
// declared with its original value. Pure file checks — no browser is launched.

import { expect, test } from "@playwright/test";

import { PERSISTED_IDS, persistedIdProblem } from "./support/legacySecondBrainPersistedIds.mjs";

const REPO_ROOT = new URL("../../", import.meta.url);

for (const entry of PERSISTED_IDS) {
  test(`persisted id unchanged: ${entry.id}`, () => {
    expect(persistedIdProblem(REPO_ROOT, entry)).toBeNull();
  });
}
