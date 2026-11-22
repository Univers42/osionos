/**
 * "osio is answering" (osio-bot OB12): while an auto-post run streams to the
 * asker, the channel gets a textless signal through the typing path, and
 * readers show "osio is answering". No partial text reaches the channel, and
 * a draft-mode run (only the asker sees it) signals nothing.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { CHANNEL, aiDraftWorld } from "./channel-ai-draft-fixtures";

interface TypingModule {
  AI_TYPER?: string;
  typerOf?: (payload: Record<string, unknown>, selfUserId: string) => string | null;
  typingPhrase?: (typers: string[], names: Record<string, string>) => string;
}

const typingModule = async () => (await import("@/widgets/channel-messages/model/aiTyping")) as TypingModule;

test("OB12: an auto-post run signals the channel while it streams, with the channel id only", async () => {
  const w = aiDraftWorld({ seen: ["autopost"] });
  w.ask(true);
  await w.settled();
  assert.ok(w.calls.answering.length >= 1, "signalled at least once");
  assert.ok(w.calls.answering.every((one) => one === CHANNEL));
  assert.ok(w.calls.answering.length <= 2, "rate-limited, not one per text delta");
});

test("OB12: a draft-mode run signals nothing", async () => {
  const w = aiDraftWorld({ seen: ["draft"] });
  w.ask(false);
  await w.settled();
  assert.deepEqual(w.calls.answering, []);
});

test("OB12: a textless ai typing frame is osio; a person's frame is the person; my own is nobody", async () => {
  const { AI_TYPER, typerOf } = await typingModule();
  assert.equal(typeof typerOf, "function");
  const of = typerOf as NonNullable<typeof typerOf>;
  assert.equal(of({ channelId: CHANNEL, ai: true }, "me"), AI_TYPER);
  assert.equal(of({ channelId: CHANNEL, userId: "ana" }, "me"), "ana");
  assert.equal(of({ channelId: CHANNEL, userId: "me" }, "me"), null);
  assert.equal(of({ channelId: CHANNEL }, "me"), null);
});

test("OB12: readers see \"osio is answering\", beside people typing", async () => {
  const { AI_TYPER, typingPhrase } = await typingModule();
  assert.equal(typeof typingPhrase, "function");
  const phrase = typingPhrase as NonNullable<typeof typingPhrase>;
  assert.equal(phrase([AI_TYPER as string], {}), "osio is answering…");
  assert.equal(phrase(["ana", AI_TYPER as string], { ana: "Ana" }), "Ana is typing… osio is answering…");
  assert.equal(phrase(["ana"], { ana: "Ana" }), "Ana is typing…", "people alone read as before");
});
