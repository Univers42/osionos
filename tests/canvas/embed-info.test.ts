/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embed-info.test.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  embedInfoFromProvider,
  parseEmbedInfo,
  parseEmbedSnapshot,
} from "../../src/shared/lib/embed/embedInfo.ts";
import { resolveProviderEmbed } from "../../src/shared/lib/embed/embedProviders.ts";

const fixture: unknown = JSON.parse(
  readFileSync(new URL("../fixtures/embed-info.sample.json", import.meta.url), "utf8"),
);

function mutated(patch: Record<string, unknown>): unknown {
  return { ...(fixture as Record<string, unknown>), ...patch };
}

test("the shared fixture parses to an equal object", () => {
  assert.deepEqual(parseEmbedInfo(fixture), fixture);
});

test("non-objects are rejected", () => {
  for (const value of [null, undefined, 1, "x", true, [], [fixture]]) {
    assert.equal(parseEmbedInfo(value), null);
  }
});

test("an unknown or missing kind is rejected", () => {
  for (const kind of ["iframe", "VIDEO", "", 3, null, undefined]) {
    assert.equal(parseEmbedInfo(mutated({ kind })), null, String(kind));
  }
  for (const kind of ["video", "audio", "rich", "photo", "file", "link"]) {
    assert.equal(parseEmbedInfo(mutated({ kind }))?.kind, kind);
  }
});

test("an unsafe or missing url rejects the whole object", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "//x.example", "https://u:p@x.example/", "", 5, null]) {
    assert.equal(parseEmbedInfo(mutated({ url })), null, String(url));
  }
});

test("unsafe image and favicon are blanked, not rejected", () => {
  const info = parseEmbedInfo(mutated({ image: "javascript:alert(1)", favicon: "data:image/png;base64,AA" }));
  assert.equal(info?.image, "");
  assert.equal(info?.favicon, "");
  assert.equal(parseEmbedInfo(mutated({ image: null }))?.image, "");
});

test("player: unsafe src nulls it, aspect is clamped, non-objects null", () => {
  assert.equal(parseEmbedInfo(mutated({ player: { src: "javascript:alert(1)", aspect: "16/9" } }))?.player, null);
  assert.equal(parseEmbedInfo(mutated({ player: "https://x.example/" }))?.player, null);
  assert.equal(parseEmbedInfo(mutated({ player: { src: "https://p.example/v", aspect: "99999/1" } }))?.player?.aspect, "16/9");
  assert.equal(parseEmbedInfo(mutated({ player: { src: "https://p.example/v", aspect: "1/100" } }))?.player?.aspect, "16/9");
  assert.equal(parseEmbedInfo(mutated({ player: { src: "https://p.example/v" } }))?.player?.aspect, "16/9");
  assert.equal(parseEmbedInfo(mutated({ player: { src: "https://p.example/v", aspect: "4/3" } }))?.player?.aspect, "4/3");
});

test("media: unsafe src or a malformed mime nulls it", () => {
  assert.deepEqual(parseEmbedInfo(mutated({ media: { src: "https://m.example/a.mp4", mime: "video/mp4" } }))?.media, {
    src: "https://m.example/a.mp4",
    mime: "video/mp4",
  });
  assert.equal(parseEmbedInfo(mutated({ media: { src: "blob:https://x/1", mime: "video/mp4" } }))?.media, null);
  assert.equal(parseEmbedInfo(mutated({ media: { src: "https://m.example/a", mime: "text/html;<script>" } }))?.media, null);
  assert.equal(parseEmbedInfo(mutated({ media: { src: "https://m.example/a", mime: "nope" } }))?.media, null);
});

test("text fields are capped: title 300, description 500, siteName and provider 100", () => {
  const info = parseEmbedInfo(
    mutated({ title: "t".repeat(301), description: "d".repeat(501), siteName: "s".repeat(101), provider: "p".repeat(101) }),
  );
  assert.equal(info?.title.length, 300);
  assert.equal(info?.description.length, 500);
  assert.equal(info?.siteName.length, 100);
  assert.equal(info?.provider?.length, 100);
  assert.equal(parseEmbedInfo(mutated({ title: "t".repeat(300) }))?.title.length, 300);
});

test("non-string text becomes empty, provider becomes null, frameable must be boolean", () => {
  const info = parseEmbedInfo(mutated({ title: { a: 1 }, description: 5, siteName: null, provider: 7, frameable: "yes" }));
  assert.equal(info?.title, "");
  assert.equal(info?.description, "");
  assert.equal(info?.siteName, "");
  assert.equal(info?.provider, null);
  assert.equal(info?.frameable, null);
  assert.equal(parseEmbedInfo(mutated({ frameable: false }))?.frameable, false);
});

test("unknown properties are dropped", () => {
  const info = parseEmbedInfo(mutated({ html: "<script>alert(1)</script>", __proto__x: 1 }));
  assert.ok(info !== null);
  assert.deepEqual(Object.keys(info).sort(), Object.keys(fixture as object).sort());
});

const SNAPSHOT = { ...(fixture as Record<string, unknown>), resolvedAt: "2026-10-18T12:00:00.000Z" };

test("a snapshot parses with resolvedAt kept", () => {
  assert.equal(parseEmbedSnapshot(SNAPSHOT)?.resolvedAt, "2026-10-18T12:00:00.000Z");
  assert.equal(parseEmbedSnapshot(SNAPSHOT)?.player?.src, "https://player.vimeo.example/video/76979871");
});

test("a snapshot without a valid resolvedAt, or not an object, is refused", () => {
  assert.equal(parseEmbedSnapshot(fixture), null);
  assert.equal(parseEmbedSnapshot({ ...SNAPSHOT, resolvedAt: "not a date" }), null);
  assert.equal(parseEmbedSnapshot({ ...SNAPSHOT, resolvedAt: 5 }), null);
  assert.equal(parseEmbedSnapshot("x"), null);
  assert.equal(parseEmbedSnapshot(null), null);
});

test("a snapshot whose JSON exceeds 64 KB is refused, just under is kept", () => {
  const overhead = JSON.stringify({ ...SNAPSHOT, extra: "" }).length;
  const limit = 64 * 1024;
  assert.notEqual(parseEmbedSnapshot({ ...SNAPSHOT, extra: "x".repeat(limit - overhead) }), null);
  assert.equal(parseEmbedSnapshot({ ...SNAPSHOT, extra: "x".repeat(limit - overhead + 1) }), null);
  assert.equal(parseEmbedSnapshot({ ...SNAPSHOT, extra: "é".repeat(limit) }), null);
});

test("a snapshot that cannot be serialised is refused, not thrown", () => {
  const cyclic: Record<string, unknown> = { ...SNAPSHOT };
  cyclic["self"] = cyclic;
  assert.equal(parseEmbedSnapshot(cyclic), null);
  assert.equal(parseEmbedSnapshot({ ...SNAPSHOT, big: 10n }), null);
});

test("embedInfoFromProvider builds an offline snapshot the parser accepts unchanged", () => {
  const url = "https://youtu.be/dQw4w9WgXcQ";
  const provider = resolveProviderEmbed(url);
  assert.ok(provider !== null);
  const info = embedInfoFromProvider(url, provider);
  assert.deepEqual(info, {
    url,
    kind: "video",
    provider: "YouTube",
    title: "",
    description: "",
    siteName: "YouTube",
    image: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    favicon: "",
    player: { src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", aspect: "16/9" },
    media: null,
    frameable: true,
  });
  assert.deepEqual(parseEmbedInfo(info), info);
});

test("embedInfoFromProvider marks a provider known not to frame as frameable:false", () => {
  const gist = "https://gist.github.com/octocat/6cad326836d38bd3a7ae";
  const provider = resolveProviderEmbed(gist);
  assert.ok(provider !== null);
  assert.equal(embedInfoFromProvider(gist, provider).frameable, false);
});
