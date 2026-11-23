// groot ADR 0064 PS36: while osio.profile.page is not live, a banner change is also written
// to the README page cover, so beta and live show the same picture.
import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "../../src/entities/page/index.ts";
import { mirrorBannerToCover, type BannerCoverIo } from "../../src/widgets/profile-page/model/bannerCoverMirror.ts";
import type { LinkedPage } from "../../src/widgets/profile-page/model/readmeCustomize.ts";

const OLD = "https://bridge.test/api/media/banners/old.webp";
const NEW = "https://bridge.test/api/media/banners/new.webp";

function io(linked: LinkedPage, readmePageId: string | null = "readme") {
  const writes: Array<[string, string | null]> = [];
  const opened: string[] = [];
  const deps: BannerCoverIo = {
    readmePageId,
    openReadme: async (pageId) => { opened.push(pageId); return linked; },
    setCover: (pageId, cover) => { writes.push([pageId, cover]); },
  };
  return { deps, writes, opened };
}

const found = (cover?: string): LinkedPage => ({ status: "found", page: { _id: "readme", cover } as PageEntry });

test("an upload writes the new banner as the README cover", async () => {
  const { deps, writes } = io(found(OLD));
  assert.equal(await mirrorBannerToCover(deps, { banner: NEW, previous: OLD }), "mirrored");
  assert.deepEqual(writes, [["readme", NEW]]);
});

test("a removal clears the cover only while it is still the removed banner", async () => {
  const same = io(found(OLD));
  assert.equal(await mirrorBannerToCover(same.deps, { banner: null, previous: OLD }), "mirrored");
  assert.deepEqual(same.writes, [["readme", null]]);

  const chosen = io(found("linear-gradient(#000, #fff)"));
  assert.equal(await mirrorBannerToCover(chosen.deps, { banner: null, previous: OLD }), "skipped");
  assert.deepEqual(chosen.writes, []);
});

test("no README, or a README that is gone, is left alone and never created", async () => {
  const none = io(found(), null);
  assert.equal(await mirrorBannerToCover(none.deps, { banner: NEW, previous: null }), "skipped");
  assert.deepEqual(none.opened, []);

  const gone = io({ status: "gone" });
  assert.equal(await mirrorBannerToCover(gone.deps, { banner: NEW, previous: null }), "skipped");
  assert.deepEqual(gone.writes, []);
});

test("a README that could not be read is reported, not written", async () => {
  const failed = io({ status: "error" });
  assert.equal(await mirrorBannerToCover(failed.deps, { banner: NEW, previous: null }), "failed");
  assert.deepEqual(failed.writes, []);
});
