/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embed-view-model.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { EmbedInfo, EmbedSnapshot } from "@/shared/lib/embed";
import { chooseEmbedView, type EmbedView } from "@/shared/ui/embed/model/chooseEmbedView.ts";

const APP = ["https://app.example"];
const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const GIST = "https://gist.github.com/octocat/6cad326836d38bd3a7ae";

function snapshot(patch: Partial<EmbedInfo> = {}): EmbedSnapshot {
  return {
    url: "https://news.example/story", kind: "link", provider: null, title: "Story",
    description: "d", siteName: "News", image: "", favicon: "", player: null, media: null,
    frameable: null, resolvedAt: "2026-10-18T10:00:00Z", ...patch,
  };
}

function choose(url: string, snap?: EmbedSnapshot | null): EmbedView {
  return chooseEmbedView({ url, snapshot: snap, forbiddenOrigins: APP });
}

test("malformed, javascript: and credentialed urls are text", () => {
  for (const url of ["not a url", "javascript:alert(1)", "data:text/html,x", "https://u:p@a.example/", ""]) {
    assert.deepEqual(choose(url), { kind: "text", url });
  }
});

test("a provider video is a facade on the provider src", () => {
  const view = choose(YOUTUBE);
  assert.equal(view.kind, "facade");
  if (view.kind !== "facade") return;
  assert.match(view.embed.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.equal(view.embed.provider, "YouTube");
});

test("a provider rich embed is a provider-policy frame", () => {
  const view = choose("https://www.figma.com/file/abc123/Name");
  assert.equal(view.kind, "frame");
  if (view.kind === "frame") assert.equal(view.policy, "provider");
});

test("the provider table wins over a snapshot player pointing elsewhere", () => {
  const view = choose(YOUTUBE, snapshot({ url: YOUTUBE, player: { src: "https://evil.example/p", aspect: "16/9" } }));
  assert.equal(view.kind, "facade");
  if (view.kind === "facade") assert.match(view.embed.src, /youtube-nocookie\.com/);
});

test("a provider that refuses framing (gist) is a refused card", () => {
  const view = choose(GIST);
  assert.equal(view.kind, "card");
  if (view.kind === "card") assert.equal(view.reason, "refused");
});

test("a snapshot player becomes a generic frame with a clamped aspect", () => {
  const view = choose("https://news.example/story", snapshot({ player: { src: "https://player.example/x", aspect: "9999/1" } }));
  assert.deepEqual(view, { kind: "frame", src: "https://player.example/x", policy: "generic", aspect: "16/9" });
});

test("hostile snapshot players are never framed", () => {
  const js = choose("https://news.example/story", snapshot({ player: { src: "javascript:alert(1)", aspect: "16/9" } }));
  assert.deepEqual(js, { kind: "frame", src: "https://news.example/story", policy: "generic" });
  const same = choose("https://news.example/story", snapshot({ player: { src: "https://app.example/steal", aspect: "16/9" } }));
  assert.equal(same.kind, "card");
  if (same.kind === "card") assert.equal(same.reason, "unsafe-frame");
});

test("frameable:false on the snapshot is a refused card, even with a player", () => {
  const view = choose("https://news.example/story", snapshot({ frameable: false, player: { src: "https://player.example/x", aspect: "16/9" } }));
  assert.equal(view.kind, "card");
  if (view.kind === "card") assert.equal(view.reason, "refused");
});

test("a card keeps the requested url, not the snapshot's", () => {
  const view = choose("https://news.example/story", snapshot({ url: "https://other.example/", frameable: false }));
  assert.equal(view.kind === "card" && view.info.url, "https://news.example/story");
});

test("a plain page is a generic frame; the app's own origin is not framed", () => {
  assert.deepEqual(choose("https://news.example/story"), { kind: "frame", src: "https://news.example/story", policy: "generic" });
  const own = choose("https://app.example/page");
  assert.equal(own.kind, "card");
  if (own.kind === "card") assert.equal(own.reason, "unsafe-frame");
});

test("direct files by extension are media", () => {
  const cases: [string, string][] = [["a.mp4", "video"], ["a.MP3", "audio"], ["a.png?x=1", "image"]];
  for (const [file, mediaKind] of cases) {
    assert.deepEqual(choose(`https://files.example/${file}`), { kind: "media", mediaKind, src: `https://files.example/${file}` });
  }
});

test("snapshot media is media; a hostile media src is dropped", () => {
  const ok = choose("https://files.example/dl", snapshot({ media: { src: "https://files.example/v", mime: "video/mp4" } }));
  assert.deepEqual(ok, { kind: "media", mediaKind: "video", src: "https://files.example/v" });
  const bad = choose("https://files.example/dl", snapshot({ media: { src: "javascript:1", mime: "video/mp4" } }));
  assert.equal(bad.kind, "frame");
});

test("a garbage snapshot is ignored", () => {
  const garbage = { kind: "nope" } as unknown as EmbedSnapshot;
  assert.equal(choose("https://news.example/story", garbage).kind, "frame");
});
