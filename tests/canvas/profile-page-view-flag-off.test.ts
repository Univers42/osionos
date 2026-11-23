// groot ADR 0064 PS37: with osio.profile.page off, ProfilePageView draws what develop drew for
// the profession branch and the admin-template branch. ProfilePageView now builds `today` as one
// expression and hands it to ProfileOrPage; the expected trees below are develop's early
// returns for those two branches, written out.
// Caveat: renderToStaticMarkup runs no effects, so useProfile's profile is null here: this pins
// the branch structure and its wrappers, not a loaded profile's content (the flag-off browser
// spec in tests/e2e/bridge-stub/profileAsPage.spec.mjs covers a loaded one).

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { bakeBuildEnv, setFlagOverride } from "./support/layout-modes-flag.ts";
import "./support/user-store-env.ts";

bakeBuildEnv({ MODE: "test" });
setFlagOverride("osio.profile.page", null);

const { ProfilePageView } = await import("../../src/widgets/profile-page/ProfilePageView.tsx");
const { ProfileFrame } = await import("../../src/widgets/profile-page/ProfileFrame.tsx");
const { ProfileActions } = await import("../../src/widgets/profile-page/profileChrome.tsx");
const { ReadmeBlocks } = await import("../../src/widgets/profile-page/ReadmeBlocks.tsx");
const { BindingProvider, toBoundRecord, toReadmeRecord } = await import("../../src/widgets/profile-page/model/binding.tsx");
const { PageBlocksRenderer } = await import("../../src/widgets/page-renderer/ui/PageBlocksRenderer.tsx");
const { professionProfileContent } = await import("../../src/data/professions/professionProfiles.ts");
const { useProfessionStore } = await import("../../src/features/professions/model/useProfessionStore.ts");
const { useUserStore } = await import("../../src/features/auth/index.ts");
const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");

const U = "0a1b2c3d-0000-4000-8000-00000000000a";
const TEMPLATE = [{ id: "t1", type: "paragraph", content: "Admin template body" }];
const ignoreSave = (): void => undefined;
const h = React.createElement;
const view = () => renderToStaticMarkup(h(ProfilePageView, { userId: U }));

interface ServerStore { getInitialState: () => object }

/** Server rendering reads a zustand store's initial state, not setState's, so the state a
 *  branch needs is written there for `draw` and put back afterwards. */
function withServerState(patches: Array<[ServerStore, Record<string, unknown>]>, draw: () => void): void {
  const saved = patches.map(([store, patch]) => {
    const initial = store.getInitialState() as Record<string, unknown>;
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, initial[key]]));
    Object.assign(initial, patch);
    return () => Object.assign(initial, before);
  });
  try {
    draw();
  } finally {
    for (const restore of saved) restore();
  }
}

test("flag off, profession picked: the profession frame as on develop", () => {
  setFlagOverride("osio.profile.page", null);
  withServerState([[useUserStore, { activeUserId: U }], [useProfessionStore, { profession: "developer" }]], () => {
    const develop = renderToStaticMarkup(h(ProfileFrame, { userId: U, profile: null, onSaved: ignoreSave },
      h("button", {
        type: "button", "data-testid": "profession-repick", onClick: ignoreSave,
        className: "mb-4 rounded-md border border-[var(--osio-border-default)] px-3 py-1 text-sm text-[var(--osio-fg-muted)]",
      }, "Change profession"),
      h(BindingProvider, { record: toBoundRecord(null) }, h(PageBlocksRenderer, { blocks: professionProfileContent("developer") })),
      h(ReadmeBlocks, { readme: undefined, record: toReadmeRecord(null) }),
    ));
    const markup = view();
    assert.match(markup, /data-testid="profession-repick"/, "control: the profession branch is the one drawn");
    assert.equal(markup, develop);
  });
});

test("flag off, admin template on: the template column as on develop", () => {
  setFlagOverride("osio.profile.template", "1");
  const entry = { _id: "tpl", workspaceId: "w", ownerId: U, title: "Profile", parentPageId: null, isTemplate: true, templateSurface: "profile", content: TEMPLATE };
  const pages = { w: [entry] } as never;
  withServerState([[usePageStore, { pages, ...derivePageState(pages, {}) }]], () => {
    const develop = renderToStaticMarkup(h("div", { className: "h-full overflow-auto bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]" },
      h("div", { className: "mx-auto max-w-3xl px-6 py-10" },
        h(ProfileActions, { userId: U, name: "" }),
        h(BindingProvider, { record: toBoundRecord(null) }, h(PageBlocksRenderer, { blocks: TEMPLATE as never })),
        h(ReadmeBlocks, { readme: undefined, record: toReadmeRecord(null) }),
      ),
    ));
    const markup = view();
    assert.ok(markup.includes("Admin template body"), "control: the template branch is the one drawn");
    assert.equal(markup, develop);
  });
  setFlagOverride("osio.profile.page", null);
});
