// ADR 0067 PH7 / ADR 0064 PS22 for osio.profile.page: the profile-as-a-page surface adds nothing
// to the boot chunk graph. It loads behind the profile tab's own lazy import.
// Caveat: a source check, not a bundle measurement. It holds while these imports keep their
// shape; a new static importer under a name not listed in SURFACE is not seen.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

const SURFACE = ["ProfileAsPage", "CreateProfilePage", "ProfileIdentityHeader", "useReadmeCover", "profileReadmeSeed", "sharedCover"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Files that import a module of the surface statically (`import ... from`), not through import(). */
function staticImporters(module: string): string[] {
  const pattern = new RegExp(`^import [^;]*from ["'][^"']*/${module}["']`, "m");
  return sources(SRC).filter((path) => pattern.test(readFileSync(path, "utf8"))).map((path) => relative(SRC, path));
}

test("PH7: the profile tab and the page surface stay lazy", () => {
  assert.match(read("widgets/page-renderer/ui/lazyViews.tsx"), /lazy\(\(\) =>\s*import\("@\/widgets\/profile-page\/ProfilePageView"\)/);
  assert.match(read("widgets/profile-page/ProfileOrPage.tsx"), /lazy\(\(\) => import\("\.\/ProfileAsPage"\)/);
});

test("PH7: the page surface is imported only from inside its own lazy chunk", () => {
  const insideChunk = new Set([
    "widgets/profile-page/ProfileAsPage.tsx",
    "widgets/profile-page/CreateProfilePage.tsx",
  ]);
  // Control: the scanner does see a static import, so an empty list below is not vacuous.
  assert.deepEqual(staticImporters("ProfileOrPage"), ["widgets/profile-page/ProfilePageView.tsx"]);
  for (const module of SURFACE) {
    const outside = staticImporters(module).filter((path) => !insideChunk.has(path));
    assert.deepEqual(outside, [], `${module} has a static importer outside the lazy chunk`);
  }
});

// PS36: the banner is not copied into the README page cover. A write overwrote a hand-set cover
// and left a dangling one when the banner object was deleted; the cover falls back to the
// banner at render time only, and the write waits for a bridge ruling.
test("PS36: a banner change writes nothing to the README page", () => {
  const banner = read("features/settings/profile/BannerUpload.tsx");
  assert.doesNotMatch(banner, /widgets\/profile-page|isProfilePageEnabled|editPageHeader|patchPage/);
  for (const gone of ["widgets/profile-page/bannerCoverSync.ts", "widgets/profile-page/model/bannerCoverMirror.ts"]) {
    assert.equal(existsSync(join(SRC, gone)), false, `${gone} is removed`);
  }
});
