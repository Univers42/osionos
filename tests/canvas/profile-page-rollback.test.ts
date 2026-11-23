// groot ADR 0064 PS38: turning osio.profile.page off is the rollback. After a session that
// changed the banner with the flag on (so the README cover was written too), the flag off
// draws exactly today's ProfileShell, with the new bannerUrl and no page cover.

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { bakeBuildEnv, setFlagOverride } from "./support/layout-modes-flag.ts";

bakeBuildEnv({ MODE: "test" });
setFlagOverride("osio.profile.page", null);

const { ProfileOrPage } = await import("../../src/widgets/profile-page/ProfileOrPage.tsx");
const { ProfileShell } = await import("../../src/widgets/profile-page/ProfileShell.tsx");
const { mirrorBannerToCover } = await import("../../src/widgets/profile-page/model/bannerCoverMirror.ts");

const OLD = "https://cdn.example/old-banner.png";
const NEW = "https://cdn.example/new-banner.png";
const readme = { _id: "readme-a", cover: OLD as string | undefined };

const profile = {
  userId: "user-a", name: "Sam Lee", avatar: null, lastSeenAt: null, online: false, username: "sam",
  bannerUrl: NEW, readme: { pageId: readme._id, blocks: [] },
} as never;

const today = () => React.createElement(ProfileShell, { bannerUrl: NEW, sidebar: null }, React.createElement("p", null, "today"));
const viewed = () => renderToStaticMarkup(React.createElement(ProfileOrPage, { userId: "user-a", profile, isOwner: true }, today()));

test("PS38: the flag-on session wrote the cover and drew the page, not the shell", async () => {
  setFlagOverride("osio.profile.page", "1");
  const outcome = await mirrorBannerToCover({
    readmePageId: readme._id,
    openReadme: async () => ({ status: "found", page: readme as never }),
    setCover: (_id, cover) => { readme.cover = cover ?? undefined; },
  }, { banner: NEW, previous: OLD });
  assert.equal(outcome, "mirrored");
  assert.equal(readme.cover, NEW);
  assert.notEqual(viewed(), renderToStaticMarkup(today()));
  assert.doesNotMatch(viewed(), /profile-banner/);
});

test("PS38: with the flag off again the profile is today's DOM, byte for byte", () => {
  setFlagOverride("osio.profile.page", null);
  const markup = viewed();
  assert.equal(markup, renderToStaticMarkup(today()));
  assert.match(markup, /data-testid="profile-banner"/);
  assert.ok(markup.includes(NEW));
  assert.doesNotMatch(markup, /page-cover|profile-as-page|profile-page-create/);
});
