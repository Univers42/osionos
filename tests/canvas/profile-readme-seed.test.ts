// ADR 0064 PS34: "Create profile page" fills the new README from the Profile shell, minus
// its identity row (the profile draws that from the account), under fresh ids each time,
// and only when osio.layout.modes lets region containers be written (TD18, ADR 0067 RD6).

import assert from "node:assert/strict";
import test from "node:test";

import { setLayoutModesOverride } from "./support/layout-modes-flag.ts";

const { profileReadmeSeed } = await import("../../src/widgets/profile-page/model/profileReadmeSeed.ts");
const { profileShell, profileBodySections } = await import("../../src/data/templates/catalogue/shells/personalShells.ts");

const ids = (blocks: { id: string; children?: unknown[] }[]): string[] =>
  blocks.flatMap((block) => [block.id, ...ids((block.children ?? []) as never)]);

test("layout modes off: the README starts empty", async () => {
  setLayoutModesOverride(null);
  assert.deepEqual(await profileReadmeSeed(), []);
});

test("layout modes on: the shell body, fresh ids on every create, no identity row", async () => {
  setLayoutModesOverride("1");
  const first = await profileReadmeSeed();
  const second = await profileReadmeSeed();
  assert.equal(first.length, profileBodySections().length);
  assert.equal(profileShell().length, profileBodySections().length + 2, "the shell is identity + divider + body");
  const shared = new Set(ids(first as never));
  assert.ok(ids(second as never).every((id) => !shared.has(id)), "no block id reused across two READMEs");
  assert.ok(!JSON.stringify(first).includes("Your name"));
});
