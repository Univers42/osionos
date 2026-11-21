/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slash-preview.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The slash menu's preview pane: where it sits beside the menu, and which
// commands draw a real sample (the rest show their description alone).

import assert from "node:assert/strict";
import test from "node:test";

import { placeSlashMenu, PREVIEW_WIDTH } from "@/features/slash-commands/model/slashMenuPlacement";
import { slashPreviewSample } from "@/features/slash-commands/model/slashPreviewSamples";
import { SLASH_COMMANDS, TURN_INTO_COMMANDS } from "@/features/slash-commands/model/slashMenuCatalog";

const caret = { x: 200, y: 520, top: 500 };

test("the preview hangs right of the menu, on the caret's side of it", () => {
  const { menu, preview } = placeSlashMenu(caret, 1280, 800);
  assert.equal(menu.left, 200);
  assert.equal(preview?.left, 200 + 324 + 6);
  assert.equal(preview?.bottom, menu.bottom);
  assert.equal(preview?.top, undefined);
});

test("the preview moves left when the right has no room, and goes when neither has", () => {
  const nearRight = placeSlashMenu({ ...caret, x: 900 }, 1280, 800);
  assert.equal(nearRight.preview?.left, Number(nearRight.menu.left) - 6 - PREVIEW_WIDTH);
  assert.equal(placeSlashMenu({ ...caret, x: 16 }, 390, 800).preview, null);
});

test("a caret near the top puts the menu and the preview below it", () => {
  const { menu, preview } = placeSlashMenu({ x: 200, y: 60, top: 40 }, 1280, 800);
  assert.equal(menu.top, 66);
  assert.equal(preview?.top, 66);
});

test("every basic block and turn-into draws a sample of its own type", () => {
  const drawn = [...SLASH_COMMANDS, ...TURN_INTO_COMMANDS].filter(
    (command) => (command.kind === "block" || command.kind === "turn-into") && slashPreviewSample(command),
  );
  assert.ok(drawn.length >= 15, `only ${drawn.length} commands draw a sample`);
  for (const command of drawn) {
    if (command.kind !== "block" && command.kind !== "turn-into") continue;
    const types = slashPreviewSample(command)?.map((block) => block.type) ?? [];
    assert.ok(types.includes(command.blockType), `${command.label} sample lacks ${command.blockType}`);
  }
});

test("media, databases and layouts show their description alone", () => {
  const image = SLASH_COMMANDS.find((command) => command.kind === "media-picker");
  const layout = SLASH_COMMANDS.find((command) => command.kind === "block" && command.layoutMode);
  assert.ok(image && layout);
  assert.equal(slashPreviewSample(image), null);
  assert.equal(slashPreviewSample(layout), null);
});
