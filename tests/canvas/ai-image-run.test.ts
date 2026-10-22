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
 * URL the bridge did not mint is refused, the store never asks the network
 * for an empty prompt — and a stopped run forgets its prompt.
 *
 * The published page says which image the AI made. The service is a fake:
 * the frames are the ones the contract describes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Block } from "@/entities/block";
import { isAiGenerated } from "@/entities/block/model/mediaBlocks";
import { MediaBlockReadOnly } from "@/entities/block/ui";
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

/** A stream that never ends: the run waits for it, until the stop aborts it. */
function hangingStream(signal: AbortSignal | null | undefined): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const end = (): void => {
        try {
          controller.close();
        } catch {
          // The stream is already closed: nothing to do.
        }
      };
      if (signal?.aborted) end();
      else signal?.addEventListener("abort", end);
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** Lets the pending promises run. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
/* The read-only page                                                          */
/* -------------------------------------------------------------------------- */
/*
 * The editor's image was checked in a browser; the PUBLISHED page was only
 * read in the source. These are the same drawing — the read-only renderer
 * draws the media block with MediaBlockPreview — so the label is proved here
 * by drawing it.
 */

/** The block of an image the AI made, as the read-only page receives it. */
function aiImageBlock(overrides: Record<string, unknown> = {}): Block {
  return {
    id: "b1",
    type: "image",
    content: "",
    asset: `url:https://api.example/api/media/uploads/11111111-2222-3333-4444-555555555555/${"a".repeat(64)}.png`,
    mediaAlt: "AI-generated image",
    aiGenerated: { model: "z-image-turbo", runId: "r1", createdAt: "2026-10-22T00:00:00.000Z" },
    ...overrides,
  } as unknown as Block;
}

/** The page, as the browser would draw it. */
function renderReadOnly(block: Block): string {
  return renderToStaticMarkup(React.createElement(MediaBlockReadOnly, { block }));
}

/** The caption of the image, when the block has one. */
function captionOf(html: string): string | null {
  const found = /<figcaption[^>]*>.*?<\/figcaption>/.exec(html);
  return found ? found[0] : null;
}

test("the published page says the image is AI-generated", () => {
  const caption = captionOf(renderReadOnly(aiImageBlock()));

  assert.ok(caption, "the image has a caption");
  assert.match(caption, />AI-generated</, "the caption says the image is AI-generated");
  assert.match(caption, /title="Generated by z-image-turbo"/, "the caption names the model that made it");
});

test("a picture the AI did not make says nothing", () => {
  const html = renderReadOnly(aiImageBlock({ aiGenerated: undefined }));

  assert.equal(captionOf(html), null, "an ordinary image has no caption");
  assert.doesNotMatch(html, /AI-generated<\/figcaption>/, "and no label either");
});

test("a provenance the AI did not write says nothing", () => {
  const html = renderReadOnly(aiImageBlock({ aiGenerated: { model: 3 } }));

  assert.equal(captionOf(html), null, "a half-written provenance is no provenance");
});

test("a round image says it too", () => {
  const caption = captionOf(renderReadOnly(aiImageBlock({ mediaShape: "circle" })));

  assert.ok(caption, "the round image has a caption");
  assert.match(caption, />AI-generated</, "the caption says the image is AI-generated");
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

  // The catalog holds JSX, so the wiring is read as text — the way the AI
  // group's wiring is checked.
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

test("a stopped run forgets its prompt: the retry asks for nothing", async () => {
  const { setAiTransport } = await import("@/features/ai/api/aiClient");
  let imageRequests = 0;
  let otherRequests = 0;
  let asked: () => void = () => undefined;
  let cancelled: () => void = () => undefined;
  const askedForImage = new Promise<void>((resolve) => { asked = () => resolve(); });
  const cancelLanded = new Promise<void>((resolve) => { cancelled = () => resolve(); });

  setAiTransport(async (input, init) => {
    // The run's own request: a stream that never ends, until the stop.
    if (String(input).includes("/images")) {
      imageRequests += 1;
      asked();
      return hangingStream(init?.signal);
    }
    // The courtesy of the stop: the run is cancelled on the service too.
    otherRequests += 1;
    cancelled();
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });

  let images = 0;
  const running = useAiImageStore
    .getState()
    .generate("block-stopped", "a fox", () => {
      images += 1;
    });

  await askedForImage;
  useAiImageStore.getState().stop("block-stopped");
  await cancelLanded;
  const askedBefore = imageRequests + otherRequests;

  useAiImageStore.getState().retry("block-stopped");
  await running;
  await tick();

  assert.equal(imageRequests, 1, "the stopped run asked for one image, the retry for none");
  assert.equal(imageRequests + otherRequests, askedBefore, "the retry asks the service for nothing");
  assert.equal(images, 0, "no image is handed over");
  assert.equal(useAiImageStore.getState().jobs["block-stopped"], undefined, "the job is gone");
});
