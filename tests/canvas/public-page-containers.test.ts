// ADR 0064 PS40, PS42 and ADR 0067 PH1: the public view renders what the bridge copied, the
// publish dialog says what a re-publish now includes, and the flag is off unless set.
// PS1 (a stored style is hostile data) and PS3 (one bad block stays contained) run here against
// the public view; PS3's browser half is tests/e2e/bridge-stub/publicPageContainers.spec.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "./support/user-store-env.ts";

// @ts-expect-error plain .mjs, no declaration file
import { publishSnapshot } from "../../scripts/bridge-publish-snapshot.mjs";
import { OWNER_PAGE } from "../bridge/fixtures/publishContainersPage.mjs";

Reflect.set(globalThis, "document", { visibilityState: "visible", addEventListener() {}, removeEventListener() {} });

const { PublicArticle } = await import("../../src/pages/public/PublicPageView.tsx");
const { PublishContainersNotice, PUBLISH_CONTAINERS_NOTICE } = await import("../../src/features/share/PublishContainersNotice.tsx");
const { PublishSection } = await import("../../src/features/share/PublishSection.tsx");
const { isPublishContainersEnabled } = await import("../../src/shared/config/featureFlags.ts");

const view = (content: unknown, containers: boolean): string =>
  renderToStaticMarkup(React.createElement(PublicArticle, { page: { title: "T", icon: null, content: content as never, publishedAt: "" }, containers }));
const published = publishSnapshot(OWNER_PAGE, { containers: true });

test("PH1: the flag is off when nothing sets it", () => {
  assert.equal(isPublishContainersEnabled(), false);
});

test("PS42 / PS1: the public view renders a scale style as data-s-* and nothing else from it", () => {
  const html = view(published, true);
  assert.match(html, /data-s-padding="3"/);
  assert.match(html, /data-s-surface="muted"/);
  assert.match(html, /data-s-layout="grid"/);
  assert.doesNotMatch(html, /bogus|constructor|cover|data-s-minCol="99"/);
});

test("PS42 / PS1: hostile stored style never throws and keeps only scale values", () => {
  const hostile = JSON.parse('[{"id":"a","type":"paragraph","content":"x","style":{"__proto__":{"padding":9},"constructor":1,"padding":99,"surface":"muted"}}]');
  const html = view(hostile, true);
  assert.match(html, /data-s-surface="muted"/);
  assert.doesNotMatch(html, /data-s-padding/);
});

test("PS42: columns published with the switch on show their text; off they are absent", () => {
  assert.match(view(published, true), /Left, <strong>bold<\/strong>/);
  const off = publishSnapshot(OWNER_PAGE);
  assert.doesNotMatch(view(off, false), /Left|Right/);
});

test("a copy without columns or style renders the same with the flag on or off", () => {
  const plain = publishSnapshot(OWNER_PAGE);
  assert.equal(view(plain, true), view(plain, false));
});

test("PS40: the notice says columns are now included and old copies stay as they are", () => {
  assert.match(PUBLISH_CONTAINERS_NOTICE, /columns/);
  assert.match(PUBLISH_CONTAINERS_NOTICE, /earlier published copies left out/);
  assert.match(PUBLISH_CONTAINERS_NOTICE, /already published stay as they are/);
  assert.match(renderToStaticMarkup(React.createElement(PublishContainersNotice)), /columns/);
});

test("PH1: with the flag off the publish dialog shows no notice", () => {
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(PublishSection, { pageId: "p" })), /publish-containers-notice/);
});

// PH7: no boot-chunk growth. Caveat: a source check, not a bundle measurement; it holds only while
// both entry points stay lazy and the notice has one importer.
test("PH7: the public view and the share popover stay lazy, and the notice has one importer", () => {
  const read = (path: string) => readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8");
  assert.match(read("app/main.tsx"), /lazy\(\(\) => import\("@\/pages\/public\/PublicPageView"\)/);
  assert.match(read("entities/page/ui/PageShareButton.tsx"), /lazy\(\(\) =>\s*import\('@\/features\/share\/SharePopover'\)/);
  assert.doesNotMatch(read("features/share/SharePopover.tsx"), /PublishContainersNotice/);
  assert.match(read("features/share/PublishSection.tsx"), /import \{ PublishContainersNotice \} from "\.\/PublishContainersNotice"/);
});
