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
import { chooseEmbedView, playLabel, type EmbedView } from "@/shared/ui/embed/model/chooseEmbedView.ts";

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

test("a provider rich embed is a rich-policy frame (no fullscreen)", () => {
  const view = choose("https://www.figma.com/file/abc123/Name");
  assert.equal(view.kind, "frame");
  if (view.kind === "frame") assert.equal(view.policy, "rich");
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
  const js = choose("https://news.example/story", snapshot({ frameable: true, player: { src: "javascript:alert(1)", aspect: "16/9" } }));
  assert.deepEqual(js, { kind: "frame", src: "https://news.example/story", policy: "generic" });
  const same = choose("https://news.example/story", snapshot({ player: { src: "https://app.example/steal", aspect: "16/9" } }));
  assert.equal(same.kind, "card");
  if (same.kind === "card") assert.equal(same.reason, "unsafe-frame");
});

test("frameable:false on the page does not veto a validated player hosted elsewhere", () => {
  const view = choose("https://news.example/story", snapshot({ frameable: false, player: { src: "https://player.example/x", aspect: "16/9" } }));
  assert.deepEqual(view, { kind: "frame", src: "https://player.example/x", policy: "generic", aspect: "16/9" });
});

test("frameable:false with a same-origin player is still never framed", () => {
  const view = choose("https://news.example/story", snapshot({ frameable: false, player: { src: "https://app.example/x", aspect: "16/9" } }));
  assert.equal(view.kind, "card");
  if (view.kind === "card") assert.equal(view.reason, "unsafe-frame");
});

test("frameable:false with no player is a refused card", () => {
  const view = choose("https://news.example/story", snapshot({ frameable: false }));
  assert.equal(view.kind, "card");
  if (view.kind === "card") assert.equal(view.reason, "refused");
});

test("a card keeps the requested url, not the snapshot's", () => {
  const view = choose("https://news.example/story", snapshot({ url: "https://other.example/", frameable: false }));
  assert.equal(view.kind === "card" && view.info.url, "https://news.example/story");
});

test("a plain page with unknown frameability is a card, not a blind frame", () => {
  const expected = (view: EmbedView) => view.kind === "card" && view.reason === "unknown";
  assert.ok(expected(choose("https://news.example/story")));
  assert.ok(expected(choose("https://news.example/story", snapshot({ frameable: null }))));
});

test("embedAnyway frames an unknown page with the generic policy and the same guards", () => {
  const input = { url: "https://news.example/story", forbiddenOrigins: APP, embedAnyway: true };
  assert.deepEqual(chooseEmbedView(input), { kind: "frame", src: "https://news.example/story", policy: "generic" });
  const own = chooseEmbedView({ ...input, url: "https://app.example/page" });
  assert.ok(own.kind === "card" && own.reason === "unsafe-frame");
});

test("embedAnyway never overrides a refusal", () => {
  const view = chooseEmbedView({
    url: "https://news.example/story", snapshot: snapshot({ frameable: false }), forbiddenOrigins: APP, embedAnyway: true,
  });
  assert.ok(view.kind === "card" && view.reason === "refused");
});

test("a page the bridge says is frameable is a generic frame; the app's own origin is not framed", () => {
  assert.deepEqual(choose("https://news.example/story", snapshot({ frameable: true })), { kind: "frame", src: "https://news.example/story", policy: "generic" });
  const own = choose("https://app.example/page");
  assert.ok(own.kind === "card" && own.reason === "unsafe-frame");
});

test("fixed-height audio players carry their pixel height into the facade", () => {
  const cases: [string, number][] = [
    ["https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", 152],
    ["https://soundcloud.com/artist/track", 166],
    ["https://www.mixcloud.com/user/show/", 120],
  ];
  for (const [url, height] of cases) {
    const view = choose(url);
    assert.ok(view.kind === "facade" && view.height === height, url);
  }
});

test("video facades have no fixed height: they keep the aspect", () => {
  const view = choose(YOUTUBE);
  assert.ok(view.kind === "facade" && view.height === undefined);
});

test("the facade title is the real title only; no title is empty, never the provider name", () => {
  const bare = choose(YOUTUBE);
  assert.ok(bare.kind === "facade" && bare.title === "");
  const titled = choose(YOUTUBE, snapshot({ url: YOUTUBE, title: "Never Gonna Give You Up" }));
  assert.ok(titled.kind === "facade" && titled.title === "Never Gonna Give You Up");
});

test("playLabel names the title when there is one, else only the provider", () => {
  assert.equal(playLabel("Rick", "YouTube"), "Play Rick on YouTube");
  assert.equal(playLabel("", "YouTube"), "Play on YouTube");
  assert.equal(playLabel("   ", "YouTube"), "Play on YouTube");
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
  assert.ok(bad.kind === "card" && bad.reason === "unknown");
});

test("a garbage snapshot is ignored", () => {
  const garbage = { kind: "nope" } as unknown as EmbedSnapshot;
  const view = choose("https://news.example/story", garbage);
  assert.ok(view.kind === "card" && view.reason === "unknown");
});
