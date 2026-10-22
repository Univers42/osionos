/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-image-run.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The image run: the frames add up to an image, a refusal keeps its code, an
 * URL the bridge did not mint is refused, and the store never asks the network
 * for an empty prompt.
 *
 * The service is a fake: the frames are the ones the contract describes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Block } from "@/entities/block";
import { isAiGenerated } from "@/entities/block/model/mediaBlocks";
import { AiError } from "@/features/ai/api/aiClient";
import { useAiImageStore } from "@/features/ai/model/aiImageStore";
import {
  aiImageBlockFields,
  runImage,
  type GeneratedImage,
  type ImageProgress,
} from "@/features/ai/model/imageRun";
import { aiSlashCommands } from "@/features/slash-commands/model/aiSlashCommands";
import {
  filterSlashCommandsFrom,
  parseSlashQuery,
} from "@/features/slash-commands/model/slashMenuFilter";

/* -------------------------------------------------------------------------- */
/* The fake service                                                           */
/* -------------------------------------------------------------------------- */

/** One SSE frame, numbered the way the service numbers them. */
function frame(id: string, event: string, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A response whose body carries the frames in order, then ends. */
function streamResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const one of frames) controller.enqueue(encoder.encode(one));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** The image of an `image.done` frame: the URL the bridge minted, and the rest. */
const STORED = {
  url: `/api/media/uploads/11111111-2222-3333-4444-555555555555/${"a".repeat(64)}.png`,
  sha256: "a".repeat(64),
  width: 512,
  height: 512,
  mediaType: "image/png",
  model: "sd",
  runId: "run-1",
  createdAt: "2026-10-22T00:00:00.000Z",
};

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

test("the frames add up to the image, and the progress is told", async () => {
  const progress: ImageProgress[] = [];

  const result = await runImage({
    start: async () =>
      streamResponse([
        frame("1", "image.queued", { position: 2 }),
        frame("2", "image.started", { runId: "run-1", model: "sd" }),
        frame("3", "image.done", STORED),
        frame("4", "done", { runId: "run-1" }),
      ]),
    resume: async () => streamResponse([]),
    onProgress: (entry) => progress.push(entry),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.image : null, STORED);
  assert.deepEqual(
    progress,
    [
      { phase: "queued", position: 2 },
      { phase: "generating" },
    ],
    "the queue and the generation are told apart",
  );
});

test("an error frame ends the run with its own code", async () => {
  const result = await runImage({
    start: async () =>
      streamResponse([frame("1", "error", { code: "engine_unavailable", message: "the engine is down" })]),
    resume: async () => streamResponse([]),
  });

  assert.deepEqual(result, { ok: false, code: "engine_unavailable", retryAfterSeconds: null });
});

test("a refusal keeps its code and its countdown", async () => {
  const result = await runImage({
    start: async () => {
      throw new AiError(429, "rate_limited", "", new Headers({ "retry-after": "7" }));
    },
    resume: async () => streamResponse([]),
  });

  assert.deepEqual(result, { ok: false, code: "rate_limited", retryAfterSeconds: 7 });
});

test("a dropped stream is resumed after the last frame", async () => {
  const resumed: (string | undefined)[] = [];

  const result = await runImage({
    start: async () =>
      streamResponse([
        frame("1", "image.queued", { position: 0 }),
        frame("2", "image.started", { runId: "run-1", model: "sd" }),
      ]),
    resume: async (lastEventId) => {
      resumed.push(lastEventId);
      return streamResponse([
        frame("3", "image.done", STORED),
        frame("4", "done", { runId: "run-1" }),
      ]);
    },
    sleep: async () => {},
  });

  assert.deepEqual(resumed, ["2"], "the resume starts after the last frame we saw");
  assert.equal(result.ok, true, "the image still arrives");
});

test("an image the bridge did not mint is refused", async () => {
  const result = await runImage({
    start: async () =>
      streamResponse([
        frame("1", "image.done", { ...STORED, url: "https://evil.example/x.png" }),
        frame("2", "done", { runId: "run-1" }),
      ]),
    resume: async () => streamResponse([]),
  });

  assert.deepEqual(result, { ok: false, code: "invalid_image", retryAfterSeconds: null });
});

test("an aborted run is a cancellation, never a failure", async () => {
  const controller = new AbortController();

  const result = await runImage({
    start: async () => {
      controller.abort();
      throw new Error("the socket died");
    },
    resume: async () => streamResponse([]),
    signal: controller.signal,
    sleep: async () => {},
  });

  assert.deepEqual(result, { ok: false, code: "cancelled", retryAfterSeconds: null });
});

/* -------------------------------------------------------------------------- */
/* The block                                                                  */
/* -------------------------------------------------------------------------- */

test("the block carries the asset, the alt text and the provenance — never the prompt", () => {
  const fields = aiImageBlockFields(STORED as GeneratedImage, "https://api.example/");

  assert.equal(fields.asset, `url:https://api.example${STORED.url}`);
  assert.equal(fields.mediaAlt, "AI-generated image");
  assert.deepEqual(Object.keys(fields), ["asset", "mediaAlt", "aiGenerated"]);
  assert.deepEqual(Object.keys(fields.aiGenerated), ["model", "runId", "createdAt"]);
  assert.deepEqual(fields.aiGenerated, {
    model: "sd",
    runId: "run-1",
    createdAt: STORED.createdAt,
  });
  assert.equal(
    JSON.stringify(fields).includes("lighthouse"),
    false,
    "the prompt is nowhere in the block",
  );
});

test("a block knows whether its image came from the AI", () => {
  const block = (provenance: unknown): Block =>
    ({ id: "b1", type: "image", content: "", aiGenerated: provenance } as unknown as Block);

  assert.equal(isAiGenerated(block({ model: "sd", runId: "r", createdAt: "c" })), true);
  assert.equal(isAiGenerated(block(undefined)), false);
  assert.equal(isAiGenerated(block({})), false);
  assert.equal(isAiGenerated(block("yes")), false);
  assert.equal(isAiGenerated(block({ model: 3, runId: "r", createdAt: "c" })), false);
});

/* -------------------------------------------------------------------------- */
/* The entry                                                                  */
/* -------------------------------------------------------------------------- */

test("the image entry is in the AI group only when the images flag is on", () => {
  assert.equal(
    aiSlashCommands(true).some((entry) => entry.id === "ai:image"),
    false,
    "the flag is off by default",
  );

  const withImages = aiSlashCommands(true, true);
  assert.equal(withImages[withImages.length - 1]?.id, "ai:image", "the image entry comes last");
  assert.deepEqual(aiSlashCommands(false, true), [], "no service, no entry");

  // The catalog holds JSX, which node's type stripping cannot load, so the
  // wiring is read as text — the way the AI group's wiring is checked.
  const source = readFileSync(
    new URL("../../src/features/slash-commands/model/slashMenuCatalog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /aiSlashCommands\(isAiConfigured\(\), isAiImagesEnabled\(\)\)/);
});

test("the slash filter lists the image entry for /imagine", () => {
  const listed = filterSlashCommandsFrom(aiSlashCommands(true, true), "imagine a red fox");

  assert.ok(
    listed.some((item) => item.id === "ai:image"),
    "the image entry is listed for /imagine",
  );
  assert.equal(parseSlashQuery("imagine a red fox").arg, "a red fox", "the prompt is the argument");
});

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

test("the store refuses an empty prompt without touching the network", async () => {
  const { setAiTransport } = await import("@/features/ai/api/aiClient");
  let calls = 0;
  setAiTransport(async () => {
    calls += 1;
    return new Response("", { status: 500 });
  });

  await useAiImageStore.getState().generate("block-empty", "   ", () => {});

  const job = useAiImageStore.getState().jobs["block-empty"];
  assert.equal(job?.status, "error");
  assert.equal(job?.status === "error" ? job.code : null, "prompt_required");
  assert.equal(calls, 0, "no request leaves the browser");
});

test("the store hands the image over once, and forgets the job", async () => {
  const { setAiTransport } = await import("@/features/ai/api/aiClient");
  setAiTransport(async () =>
    streamResponse([
      frame("1", "image.started", { runId: "run-1", model: "sd" }),
      frame("2", "image.done", STORED),
      frame("3", "done", { runId: "run-1" }),
    ]),
  );

  const received: GeneratedImage[] = [];
  await useAiImageStore
    .getState()
    .generate("block-1", "a lighthouse at dusk", (image) => {
      received.push(image);
    });

  assert.equal(useAiImageStore.getState().jobs["block-1"], undefined, "the job is gone");
  assert.equal(received.length, 1, "the image is handed over once");
  assert.deepEqual(received[0], STORED);
});
