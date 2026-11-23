// groot ADR 0064 PS38: turning osio.profile.page off is the rollback. Nothing is written to
// the README page while the flag is on (the cover falls back to the banner at render time),
// so with the flag off again the profile is exactly today's ProfileShell.

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { bakeBuildEnv, setFlagOverride } from "./support/layout-modes-flag.ts";

bakeBuildEnv({ MODE: "test" });
setFlagOverride("osio.profile.page", null);

const { ProfileOrPage } = await import("../../src/widgets/profile-page/ProfileOrPage.tsx");
const { ProfileShell } = await import("../../src/widgets/profile-page/ProfileShell.tsx");
const { LoadingPane } = await import("../../src/shared/ui/index.ts");

const BANNER = "https://cdn.example/banner.png";

const profile = {
  userId: "user-a", name: "Sam Lee", avatar: null, lastSeenAt: null, online: false, username: "sam",
  bannerUrl: BANNER, readme: { pageId: "readme-a", blocks: [] },
} as never;

const today = () => React.createElement(ProfileShell, { bannerUrl: BANNER, sidebar: null }, React.createElement("p", null, "today"));
const viewed = () => renderToStaticMarkup(React.createElement(ProfileOrPage, { userId: "user-a", profile, isOwner: true }, today()));

// Caveat: server rendering never resolves React.lazy, so the flag-on markup is the Suspense
// fallback, not the page itself; the page is drawn in tests/canvas/profile-as-page.test.ts and
// in the profileAsPage browser spec.
test("PS38: with the flag on, the lazy page surface is mounted in place of today's shell", () => {
  setFlagOverride("osio.profile.page", "1");
  const markup = viewed();
  assert.ok(markup.length > 0);
  assert.equal(markup, renderToStaticMarkup(React.createElement(LoadingPane)));
  assert.doesNotMatch(markup, /profile-banner|today/);
});

test("PS38: with the flag off again the profile is today's DOM, byte for byte", () => {
  setFlagOverride("osio.profile.page", null);
  const markup = viewed();
  assert.equal(markup, renderToStaticMarkup(today()));
  assert.match(markup, /data-testid="profile-banner"/);
  assert.ok(markup.includes(BANNER));
  assert.doesNotMatch(markup, /page-cover|profile-as-page|profile-page-create/);
});
