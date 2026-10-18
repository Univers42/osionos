/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embed-mode.test.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Which surfaces may mount a live third-party frame: the editor and locked pages (the
// reader opened the page on purpose) and the public view, never a hover preview.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { allowsView } from "../../src/entities/block/ui/readOnlyEmbedMode.ts";
import { chooseEmbedView } from "../../src/shared/ui/embed/model/chooseEmbedView.ts";
import { SNAPSHOT } from "./link-block-fixtures.ts";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("static mode allows facades and cards but not a live frame; live allows all", () => {
  const view = (url: string) => chooseEmbedView({ url, snapshot: null, forbiddenOrigins: [] });
  const generic = chooseEmbedView({ url: "https://example.com/page", snapshot: { ...SNAPSHOT, frameable: true, player: null }, forbiddenOrigins: [] });
  assert.equal(generic.kind, "frame");
  assert.equal(allowsView("static", generic), false);
  assert.equal(allowsView("live", generic), true);
  const youtube = view("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(youtube.kind, "facade");
  assert.equal(allowsView("static", youtube), true);
  assert.equal(allowsView("static", { kind: "card" }), true);
});

test("the editor surface (editable and locked) provides live; media embeds and read-only blocks read the mode", () => {
  assert.match(read("src/features/block-editor/ui/BlockEditorSurface.tsx"), /ReadOnlyEmbedModeContext\.Provider value="live"/);
  assert.match(read("src/entities/block/ui/ProviderMediaEmbed.tsx"), /ModeAwareEmbedView/);
  assert.match(read("src/entities/block/ui/ReadOnlyLinkBlock.tsx"), /ModeAwareEmbedView/);
  assert.match(read("src/entities/block/ui/ModeAwareEmbedView.tsx"), /allowsView\(mode,/);
});
