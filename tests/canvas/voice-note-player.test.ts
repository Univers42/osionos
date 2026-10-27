/**
 * The voice-note bubble: the WhatsApp speed pill, and a play button that waits
 * for the bytes instead of failing silently while they are not there.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Attachment } from "@/shared/chat/messageApi";
import { nextPlaybackRate, WaveformPlayer } from "@/widgets/channel-messages/ui/attachments/WaveformPlayer";

test("the speed pill cycles 1× → 1.5× → 2× → 1×, and an unknown rate restarts at 1×", () => {
  assert.equal(nextPlaybackRate(1), 1.5);
  assert.equal(nextPlaybackRate(1.5), 2);
  assert.equal(nextPlaybackRate(2), 1);
  assert.equal(nextPlaybackRate(0.75), 1);
});

const player = (url: string) =>
  renderToStaticMarkup(
    React.createElement(WaveformPlayer, {
      attachment: { id: "a1", url, kind: "audio", metadata: { durationMs: 7_000 } } as unknown as Attachment,
    }),
  );

test("a served voice note waits for its bytes: play is disabled and busy until they arrive", () => {
  const html = player("/api/chat/uploads/a1");
  assert.match(html, /aria-label="Play voice message" aria-busy="true" disabled=""/);
  assert.match(html, /aria-label="Playback speed 1×"/);
  assert.match(html, /0:07/);
});

test("a local draft plays at once", () => {
  const html = player("blob:https://app.example/1");
  assert.match(html, /aria-label="Play voice message" aria-busy="false"/);
  assert.equal(html.includes(`disabled=""`), false);
});
