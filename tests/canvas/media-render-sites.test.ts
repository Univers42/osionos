/**
 * osionos#233 D233-7: every place the app draws a bridge upload draws the signed link the app
 * signer holds for it, with the page it renders in as the authority; a URL that is not an upload,
 * and every upload while signing is off, renders exactly its stored URL.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Block } from "@/entities/block";
import { MediaBlockPreview } from "@/entities/block/ui/MediaBlockPreview";
import { CoverMediaElement } from "@/entities/page/ui/CoverMediaElement";
import { CoverTile } from "@/entities/page/ui/coverPickerTiles";
import { FullscreenPicture } from "@/features/block-editor/ui/media/ImageFullscreen";
import { useImageBlockActions, type ImageBlockActions } from "@/features/block-editor/ui/media/useImageBlockActions";
import { createMediaSigner, type MediaSigner, type SignAnswer } from "@/shared/lib/media/mediaSigner";
import { MediaPageContext, MediaSignerContext, currentMediaUrl, signedMediaUrl } from "@/shared/lib/media/useSignedMediaUrl";
import { signCardCovers } from "@/widgets/database-view/model/homeLiveEntries";
import { SharedPostCard } from "@/widgets/profile-page/ProfileSharedPosts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const upload = (owner: string, n: number, ext = "png") => `/api/media/uploads/${owner}/${n.toString(16).padStart(64, "0")}.${ext}`;
const NOW_MS = Date.UTC(2026, 10, 22, 10, 5);
const signedOf = (p: string) => `${p}?exp=${Date.UTC(2026, 10, 22, 12) / 1000}&kid=0a1b2c3d&sig=${"f".repeat(64)}`;
const SIGNED_ATTR = (attr: string) => new RegExp(`${attr}="/api/media/uploads/[^"]+\\?exp=\\d+&amp;kid=0a1b2c3d&amp;sig=f{64}"`);
const noop = () => {};
const HANDLERS = { onPointerDown: noop, onPointerMove: noop, onPointerUp: noop, onPointerCancel: noop };

function answering(answer: (paths: string[]) => SignAnswer) {
  const calls: Array<{ paths: string[]; pageId: string | null }> = [];
  const signer = createMediaSigner({
    transport: async (paths, pageId) => { calls.push({ paths, pageId }); return answer(paths); },
    nowMs: () => NOW_MS,
    userId: () => ME,
  });
  return { calls, signer };
}
const signAll = (paths: string[]): SignAnswer => ({ kind: "signed", signed: Object.fromEntries(paths.map((p) => [p, signedOf(p)])), serverNowSec: NOW_MS / 1000 });

const within = (signer: MediaSigner, element: React.ReactElement, pageId: string | null = null) =>
  renderToStaticMarkup(React.createElement(MediaSignerContext.Provider, { value: signer },
    React.createElement(MediaPageContext.Provider, { value: pageId }, element)));
const mediaBlock = (type: Block["type"], url: string) =>
  React.createElement(MediaBlockPreview, { block: { id: "b1", type, content: "", asset: `url:${url}` } as Block });
const cover = (src: string) =>
  React.createElement(CoverMediaElement, { cover: src, src, isGradient: false, position: 50, attachMedia: noop, handlers: HANDLERS });

test("media blocks draw the signed link: image src, video source and poster, audio source, file href", async () => {
  const { signer } = answering(signAll);
  const [image, video, audio, file] = [upload(ME, 1), upload(ME, 2, "mp4"), upload(ME, 3, "mp3"), upload(ME, 4, "pdf")];
  for (const p of [image, video, audio, file]) await signer.sign(p);
  assert.match(within(signer, mediaBlock("image", image)), SIGNED_ATTR("<img[^>]*src"));
  const player = within(signer, mediaBlock("video", video));
  assert.match(player, SIGNED_ATTR("<source src"));
  assert.match(player, SIGNED_ATTR("poster"));
  assert.match(within(signer, mediaBlock("audio", audio)), SIGNED_ATTR("<source src"));
  assert.match(within(signer, mediaBlock("file", file)), SIGNED_ATTR("href"));
});

test("a foreign upload in a page is signed with that page as its authority", async () => {
  const { calls, signer } = answering(signAll);
  const foreign = upload(OTHER, 5);
  assert.doesNotMatch(within(signer, mediaBlock("image", foreign), "page-1"), /sig=/);
  await signer.sign(foreign, "page-1");
  assert.deepEqual(calls, [{ paths: [foreign], pageId: "page-1" }]);
  assert.match(within(signer, mediaBlock("image", foreign), "page-1"), SIGNED_ATTR("<img[^>]*src"));
});

test("the full-screen picture, the page cover (image and video), a cover tile and a shared post draw the signed link", async () => {
  const { signer } = answering(signAll);
  const [still, clip, tile, post] = [upload(ME, 6), upload(ME, 7, "mp4"), upload(ME, 8), upload(OTHER, 9)];
  for (const p of [still, clip, tile]) await signer.sign(p);
  await signer.sign(post, "shared-page");
  assert.match(within(signer, React.createElement(FullscreenPicture, { url: still, alt: "" })), SIGNED_ATTR("<img[^>]*src"));
  assert.match(within(signer, cover(still)), SIGNED_ATTR("<img[^>]*src"));
  assert.match(within(signer, cover(clip)), SIGNED_ATTR("<video[^>]*src"));
  const item = { id: "t", label: "Mine", ref: `url:${tile}` };
  assert.match(within(signer, React.createElement(CoverTile, { item, onSelect: noop })), SIGNED_ATTR("<img[^>]*src"));
  const share = { pageId: "shared-page", title: "Post", icon: null, cover: post, sharedAt: "" };
  assert.match(within(signer, React.createElement(SharedPostCard, { share })), /background-image:url\(\/api\/media\/uploads\/[^)]+sig=f{64}\)/);
});

test("image actions open, download and copy the signed picture; the copied link stays the stored one", async () => {
  const { signer } = answering(signAll);
  const stored = upload(ME, 10);
  assert.equal(currentMediaUrl(stored, null, signer), stored);
  assert.equal(await signedMediaUrl(stored, null, signer), signedOf(stored));
  assert.equal(currentMediaUrl(stored, null, signer), signedOf(stored));
  let actions: ImageBlockActions | null = null;
  const Probe = () => { actions = useImageBlockActions("page-1", "b1", stored, "", `url:${stored}`); return null; };
  within(signer, React.createElement(Probe));
  const opened: string[] = [];
  const realOpen = globalThis.open;
  globalThis.open = ((url: string) => { opened.push(url); return null; }) as typeof globalThis.open;
  try { (actions as ImageBlockActions | null)?.viewOriginal(); } finally { globalThis.open = realOpen; }
  assert.deepEqual(opened, [signedOf(stored)]);
});

test("home galleries (recents, templates) get their card covers signed with the card's page as authority", async () => {
  const { calls, signer } = answering(signAll);
  const [own, foreign] = [upload(ME, 11), upload(OTHER, 12)];
  const state = { databases: {}, views: {}, pages: {
    a: { id: "a", cover: own }, b: { id: "b", cover: foreign }, c: { id: "c", cover: "linear-gradient(red, blue)" }, d: { id: "d" },
  } } as unknown as Parameters<typeof signCardCovers>[0];
  const signed = await signCardCovers(state, signer);
  assert.equal(signed.pages.a.cover, signedOf(own));
  assert.equal(signed.pages.b.cover, signedOf(foreign));
  assert.equal(signed.pages.c.cover, "linear-gradient(red, blue)");
  assert.equal(signed.pages.d.cover, undefined);
  assert.deepEqual(new Set(calls.map((call) => call.pageId)), new Set([null, "b"]));
});

test("a URL that is not an upload, and every upload while signing is off, renders its stored URL with no request", async () => {
  const external = answering(signAll);
  const url = "https://images.example/x.jpg";
  assert.match(within(external.signer, mediaBlock("image", url)), /<img[^>]*src="https:\/\/images\.example\/x\.jpg"/);
  assert.match(within(external.signer, cover(url)), /<img[^>]*src="https:\/\/images\.example\/x\.jpg"/);
  assert.equal(await signedMediaUrl(url, null, external.signer), url);
  assert.equal(external.calls.length, 0);
  const off = answering(() => ({ kind: "off" }));
  await off.signer.sign(upload(ME, 13));
  const stored = upload(ME, 14);
  assert.match(within(off.signer, mediaBlock("image", stored)), new RegExp(`<img[^>]*src="${stored}"`));
  assert.match(within(off.signer, cover(stored)), new RegExp(`<img[^>]*src="${stored}"`));
  assert.equal(currentMediaUrl(stored, null, off.signer), stored);
  assert.equal(off.calls.length, 1);
});
