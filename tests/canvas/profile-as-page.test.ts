// ADR 0064 PS32–PS36 under osio.profile.page: the profile drawn as the README page. Its
// cover is `cover ?? bannerUrl` through the shared rule, its identity header is README-field
// bindings resolved against the viewed account's own record (by userId, never by name), and
// the owner without a README gets an explicit create action that rendering never runs.

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./support/user-store-env.ts";

const A = "0a1b2c3d-0000-4000-8000-00000000000a";

const { ProfileAsPage } = await import("../../src/widgets/profile-page/ProfileAsPage.tsx");
const { ProfileIdentityHeader, IDENTITY_BLOCKS } = await import("../../src/widgets/profile-page/ProfileIdentityHeader.tsx");
const { README_FIELDS } = await import("../../src/entities/block/model/binding.ts");
const { toReadmeRecord } = await import("../../src/widgets/profile-page/model/binding.tsx");
const { loadProfile } = await import("../../src/widgets/profile-page/useProfile.ts");
const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");

// The page access snapshot reads this (after the user store set its own): the README's owner.
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeSession: () => ({ userId: A, privateWorkspaces: [{ _id: "w", role: "owner", permissions: ["read", "update"] }], sharedWorkspaces: [] }) }),
});

const B = "0b1b2c3d-0000-4000-8000-00000000000b";
const BANNER = "https://cdn.example/banner.png";
const README = { pageId: "readme-a", blocks: [{ id: "r1", type: "paragraph", content: "Hello from my README" }] };

const profile = (extra: Record<string, unknown> = {}) => ({
  userId: A, name: "Sam Lee", avatar: null, lastSeenAt: null, online: false, username: "sam",
  headline: "Builds things", bio: "Sam's own bio", bannerUrl: BANNER, readme: README, ...extra,
}) as never;

const asPage = (props: Record<string, unknown>) => renderToStaticMarkup(
  React.createElement(ProfileAsPage, { userId: A, isOwner: false, mode: "page", profile: profile(), ...props } as never),
);

function storePage(page: Record<string, unknown>): void {
  const entry = { _id: "readme-a", workspaceId: "w", ownerId: A, title: "README", parentPageId: null, content: [], ...page };
  usePageStore.setState({ ...derivePageState({ w: [entry] as never }, usePageStore.getState() as never) } as never);
}

test("PS33: the identity header binds README fields only, to $record, and no avatar", () => {
  const keys = new Set(README_FIELDS.map((field: { key: string }) => field.key));
  assert.ok(IDENTITY_BLOCKS.length > 0);
  for (const block of IDENTITY_BLOCKS) {
    assert.equal(block.recordRef, "$record");
    assert.ok(keys.has(block.fieldBind), `${block.fieldBind} is a README field`);
    assert.ok(!/avatar/i.test(block.fieldBind));
  }
});

test("PS33: another account with the same display name does not cross into the header", async () => {
  const legacy = { userId: A, name: "Sam Lee", avatar: null, username: "sam", lastSeenAt: null, online: false };
  const io = (card: Record<string, unknown>) => ({
    getLegacy: async () => ({ ...legacy }) as never,
    getCard: async () => card,
    getOwn: async () => ({ ok: false }) as never,
    getOwnPage: async () => null,
  });
  const crossed = await loadProfile(A, false, io({ userId: B, displayName: "Sam Lee", bio: "B's private-ish bio", headline: "B headline" }));
  const crossedHtml = renderToStaticMarkup(React.createElement(ProfileIdentityHeader, { record: toReadmeRecord(crossed) }));
  assert.equal(toReadmeRecord(crossed)?.id, A, "the record is keyed by the viewed userId");
  assert.ok(crossedHtml.includes("Sam Lee"));
  assert.ok(!crossedHtml.includes("B&#x27;s private-ish bio") && !crossedHtml.includes("B headline"), crossedHtml);
  const own = await loadProfile(A, false, io({ userId: A, displayName: "Sam Lee", bio: "A real bio" }));
  const ownHtml = renderToStaticMarkup(React.createElement(ProfileIdentityHeader, { record: toReadmeRecord(own) }));
  assert.ok(ownHtml.includes("A real bio"), "control: the account's own card binds");
});

test("PS32: a visitor sees the README as a page under the banner cover, not today's shell", () => {
  const html = asPage({});
  assert.match(html, /data-testid="page-cover"/);
  assert.ok(html.includes(`src="${BANNER}"`), "cover ?? bannerUrl: the page has no cover for a visitor");
  assert.ok(html.includes("Hello from my README") && html.includes("Builds things"));
  assert.ok(!html.includes('data-testid="profile-banner"') && !html.includes('aria-label="Profile details"'));
  assert.ok(!html.includes("page-cover-toggle-picker"), "the cover is read-only here");
});

test("PS35: a cover the shared rule refuses is not drawn", () => {
  const html = asPage({ profile: profile({ bannerUrl: "javascript:alert(1)" }) });
  assert.ok(!html.includes('data-testid="page-cover"'), html.slice(0, 300));
});

test("PS36: the owner sees their README page's cover over the banner", () => {
  const gradient = "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)";
  storePage({ cover: gradient });
  const html = asPage({ isOwner: true });
  assert.ok(html.includes("#8b5cf6") && !html.includes(`src="${BANNER}"`), html.slice(0, 600));
  storePage({});
  assert.ok(asPage({ isOwner: true }).includes(`src="${BANNER}"`), "no page cover yet: the banner");
});

test("PS34: the owner without a README gets an explicit create button and nothing is created", () => {
  let created = 0;
  const addPage = usePageStore.getState().addPage;
  usePageStore.setState({ addPage: async () => { created += 1; return null; } } as never);
  try {
    const html = asPage({ isOwner: true, mode: "create", profile: profile({ readme: null }) });
    assert.match(html, /<button[^>]*type="button"[^>]*>(?:<[^>]+>)*Create profile page/);
    assert.ok(!html.includes('data-testid="profile-readme"'));
    assert.equal(created, 0);
  } finally {
    usePageStore.setState({ addPage } as never);
  }
});
