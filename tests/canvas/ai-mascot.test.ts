/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-mascot.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The binocle mascot: the mood table that drives it, the pupil clamp, the
 * markup it renders (decorative or named, never scripted), and the empty state
 * that now shows it instead of the old mark.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { eyeOffset, hasPermissionPart, mascotMoodFor, HAPPY_MS, SLEEP_MS } from "@/features/ai/model/mascotMood";
import { BinocleMascot } from "@/shared/ui/mascot/BinocleMascot";

const RECT = { left: 100, top: 100, width: 100, height: 100 };

test("mascotMoodFor: each rule on its own", () => {
  assert.equal(mascotMoodFor({ typing: false, idleMs: 0, lastAssistant: { status: "error" } }), "surprised");
  assert.equal(mascotMoodFor({ typing: false, idleMs: 0, lastAssistant: { status: "done", awaitingApproval: true } }), "shy");
  assert.equal(mascotMoodFor({ typing: false, idleMs: 0, lastAssistant: { status: "streaming" } }), "thinking");
  assert.equal(mascotMoodFor({ typing: true, idleMs: 0 }), "listening");
  assert.equal(mascotMoodFor({ typing: false, idleMs: HAPPY_MS - 1, lastAssistant: { status: "done" } }), "happy");
  assert.equal(mascotMoodFor({ typing: false, idleMs: HAPPY_MS, lastAssistant: { status: "done" } }), "curious");
  assert.equal(mascotMoodFor({ typing: false, idleMs: SLEEP_MS - 1 }), "curious");
  assert.equal(mascotMoodFor({ typing: false, idleMs: SLEEP_MS }), "sleeping");
  assert.equal(mascotMoodFor({ typing: false, idleMs: 0 }), "curious");
});

test("mascotMoodFor: error > approval > streaming > typing", () => {
  const typing = true;
  assert.equal(mascotMoodFor({ typing, idleMs: 0, lastAssistant: { status: "error", awaitingApproval: true } }), "surprised");
  assert.equal(mascotMoodFor({ typing, idleMs: 0, lastAssistant: { status: "streaming", awaitingApproval: true } }), "shy");
  assert.equal(mascotMoodFor({ typing, idleMs: 0, lastAssistant: { status: "streaming" } }), "thinking");
  assert.equal(mascotMoodFor({ typing, idleMs: SLEEP_MS, lastAssistant: { status: "done" } }), "listening");
  assert.equal(mascotMoodFor({ typing: false, idleMs: SLEEP_MS, lastAssistant: { status: "done" } }), "sleeping");
});

test("hasPermissionPart finds a write waiting on the user", () => {
  assert.equal(hasPermissionPart(undefined), false);
  assert.equal(hasPermissionPart([{ type: "citation" }]), false);
  assert.equal(hasPermissionPart([{ type: "citation" }, { type: "permission" }]), true);
});

test("eyeOffset: centre is 0,0 and every direction clamps to max", () => {
  assert.deepEqual(eyeOffset({ x: 150, y: 150 }, RECT, 5), { x: 0, y: 0 });
  assert.deepEqual(eyeOffset({ x: 9000, y: 150 }, RECT, 5), { x: 5, y: 0 });
  assert.deepEqual(eyeOffset({ x: -9000, y: 150 }, RECT, 5), { x: -5, y: 0 });
  assert.deepEqual(eyeOffset({ x: 150, y: 9000 }, RECT, 5), { x: 0, y: 5 });
  assert.deepEqual(eyeOffset({ x: 150, y: -9000 }, RECT, 5), { x: 0, y: -5 });
  const near = eyeOffset({ x: 152, y: 150 }, RECT, 5);
  assert.deepEqual(near, { x: 2, y: 0 });
  const diagonal = eyeOffset({ x: 9000, y: 9000 }, RECT, 5);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 5) < 1e-9);
});

test("BinocleMascot: decorative without a label, named with one, never scripted", () => {
  const decorative = renderToStaticMarkup(React.createElement(BinocleMascot, { mood: "thinking" }));
  assert.match(decorative, /class="binocle"/);
  assert.match(decorative, /data-mood="thinking"/);
  assert.match(decorative, /aria-hidden="true"/);
  assert.match(decorative, /focusable="false"/);
  assert.doesNotMatch(decorative, /role="img"/);
  assert.match(decorative, /viewBox="0 0 184 118"/);
  assert.equal((decorative.match(/class="svg-tube"/g) ?? []).length, 12);

  const named = renderToStaticMarkup(React.createElement(BinocleMascot, { mood: "happy", label: "Assistant" }));
  assert.match(named, /role="img"/);
  assert.match(named, /aria-label="Assistant"/);
  assert.doesNotMatch(named, /aria-hidden/);

  for (const markup of [decorative, named]) {
    assert.doesNotMatch(markup, /<script/i);
    assert.doesNotMatch(markup, /\son[a-z]+=/i);
  }
});

test("BinocleMascot: the height follows the 184:118 ratio", () => {
  const markup = renderToStaticMarkup(React.createElement(BinocleMascot, { mood: "curious", size: 184 }));
  assert.match(markup, /width="184"/);
  assert.match(markup, /height="118"/);
});

test("EmptyStateHero shows the mascot, not the old mark", async () => {
  const { EmptyStateHero } = await import("@/widgets/chat-shell/ui/EmptyStateHero");
  const noop = () => undefined;
  const markup = renderToStaticMarkup(
    React.createElement(EmptyStateHero, {
      value: "",
      onChange: noop,
      onSubmit: noop,
      onConnect: noop,
      onPick: noop,
      selection: { connectorId: "", model: "" } as never,
      onSelectionChange: noop,
      chips: [],
      onChipsChange: noop,
    }),
  );
  assert.match(markup, /class="binocle/);
  assert.doesNotMatch(markup, /osio-appmark/);
  assert.match(markup, /How can I help you today\?/);
});
