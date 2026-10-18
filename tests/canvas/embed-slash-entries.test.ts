/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embed-slash-entries.test.ts                        :+:      :+:    :+:   */
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

import { EMBED_HINTS, embedHintById, linkInputPlaceholder, linkPlaceholderText } from "../../src/shared/lib/embed/embedHints.ts";
import { resolveProviderEmbed } from "../../src/shared/lib/embed/embedProviders.ts";
import { chooseEmbedView } from "../../src/shared/ui/embed/model/chooseEmbedView.ts";
import { EMBED_SLASH_ENTRIES, EMBEDS_SECTION_ID } from "../../src/features/slash-commands/model/embedSlashEntries.ts";
import { requestLinkDialog, takeLinkDialogRequest } from "../../src/features/block-editor/model/linkDialogRequests.ts";
import { mayBeProviderLink } from "../../src/entities/block/model/mediaProviderLinks.ts";

const byId = (id: string) => EMBED_SLASH_ENTRIES.find((entry) => entry.id === id);

test("the Embeds section has /embed, /bookmark and the 17 provider shortcuts", () => {
  assert.equal(EMBEDS_SECTION_ID, "embeds");
  assert.equal(EMBED_SLASH_ENTRIES.length, 2 + 17);
  assert.equal(EMBED_HINTS.length, 17);
  assert.deepEqual(
    EMBED_HINTS.map((hint) => hint.label),
    ["YouTube", "Vimeo", "TikTok", "Twitch", "Spotify", "SoundCloud", "Loom", "Figma", "Google Maps", "Google Drive", "Tweet (X)", "Instagram", "CodePen", "GitHub Gist", "Miro", "Excalidraw", "PDF"],
  );
});

test("entry ids are unique and every provider entry creates an embed with its hint", () => {
  const ids = EMBED_SLASH_ENTRIES.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const hint of EMBED_HINTS) {
    const entry = byId(`embeds:${hint.id}`);
    assert.ok(entry, hint.id);
    assert.equal(entry.blockType, "embed");
    assert.equal(entry.hintId, hint.id);
    assert.equal(entry.label, hint.label);
  }
});

test("the generic entries carry the agreed copy and aliases", () => {
  const embed = byId("embeds:embed");
  const bookmark = byId("embeds:bookmark");
  assert.equal(embed?.description, "Embed — any web page or app");
  assert.equal(embed?.blockType, "embed");
  assert.ok(embed?.aliases.includes("iframe") && embed.aliases.includes("web"));
  assert.equal(bookmark?.description, "Web bookmark — a link card");
  assert.equal(bookmark?.blockType, "bookmark");
  assert.equal(bookmark?.hintId, undefined);
});

test("/youtube, /video link and /pdf find their entries by alias", () => {
  assert.ok(byId("embeds:youtube")?.aliases.includes("youtube"));
  assert.ok(byId("embeds:youtube")?.aliases.includes("video link"));
  assert.ok(byId("embeds:vimeo")?.aliases.includes("video link"));
  assert.ok(byId("embeds:pdf")?.aliases.includes("pdf"));
});

test("each hint's example URL shape is accepted by the provider table where one exists", () => {
  const resolvable = { youtube: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", vimeo: "https://vimeo.com/76979871" };
  for (const [id, url] of Object.entries(resolvable)) {
    assert.ok(embedHintById(id), id);
    assert.notEqual(resolveProviderEmbed(url), null, url);
  }
});

test("placeholder copy: generic, then provider-hinted", () => {
  assert.equal(linkPlaceholderText("embed"), "Embed a link");
  assert.equal(linkPlaceholderText("bookmark"), "Add a web bookmark");
  assert.equal(linkPlaceholderText("embed", embedHintById("youtube")), "Paste a YouTube link");
  assert.equal(linkInputPlaceholder("embed", embedHintById("pdf")), "https://example.com/document.pdf");
  assert.equal(embedHintById("nope"), undefined);
  assert.equal(embedHintById(undefined), undefined);
});

test("the catalog gets embed and bookmark from one source only", () => {
  const catalog = readFileSync(new URL("../../src/features/slash-commands/model/slashMenuCatalog.tsx", import.meta.url), "utf8");
  const supported = readFileSync(new URL("../../src/shared/ui/assets/collectionSlashItems.ts", import.meta.url), "utf8");
  assert.match(catalog, /\.\.\.EMBED_SLASH_COMMANDS/);
  assert.doesNotMatch(supported, /'(embed|bookmark)'/);
});

test("a dialog request is one-shot and keyed by block id", () => {
  assert.equal(takeLinkDialogRequest("blk-1"), null);
  requestLinkDialog("blk-1", "youtube");
  requestLinkDialog("blk-2");
  assert.deepEqual(takeLinkDialogRequest("blk-1"), { hintId: "youtube" });
  assert.equal(takeLinkDialogRequest("blk-1"), null);
  assert.deepEqual(takeLinkDialogRequest("blk-2"), { hintId: undefined });
});

test("only http(s) video/audio/file links that are not bare media files may be provider pages", () => {
  assert.equal(mayBeProviderLink("video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
  assert.equal(mayBeProviderLink("audio", "https://open.spotify.com/track/abc"), true);
  assert.equal(mayBeProviderLink("video", "https://example.com/fixtures/video-0.mp4"), false);
  assert.equal(mayBeProviderLink("audio", "https://example.com/a.MP3"), false);
  assert.equal(mayBeProviderLink("video", "data:video/mp4;base64,AAAA"), false);
  assert.equal(mayBeProviderLink("video", "blob:https://x/1"), false);
  assert.equal(mayBeProviderLink("image", "https://youtube.com/watch?v=x"), false);
  assert.equal(mayBeProviderLink("file", "https://drive.google.com/file/d/abc/view"), true);
});

test("C20: a .pdf link is a card, never a frame; a plain page is still a frame", () => {
  const view = chooseEmbedView({ url: "https://docs.example.net/sample.pdf", forbiddenOrigins: [] });
  assert.equal(view.kind, "card");
  assert.equal(view.kind === "card" ? view.reason : undefined, "pdf");
  assert.equal(chooseEmbedView({ url: "https://example.com/page", forbiddenOrigins: [] }).kind, "frame");
});
