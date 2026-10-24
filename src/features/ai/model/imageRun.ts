/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   imageRun.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * One image run: the frames of the service, and what they add up to.
 *
 * The service answers `POST /api/ai/images` with the run's own stream:
 * `image.queued` (only when other images are ahead), `image.started`,
 * `image.done` (the stored image and its provenance), then `done` — or
 * `error`. A refusal BEFORE the stream is an HTTP error (429 `rate_limited`,
 * 402 `budget_exhausted`, 404 `not_found`…), not a frame.
 *
 * Pure: no React, no JSX, no store — the caller brings the two openers and the
 * sink, so the whole thing is testable without a server and without a browser
 * (the module loads under `node --experimental-strip-types`).
 *
 * NEVER THROWS: every path answers a result, so a caller cannot forget one.
 */

import { failureCode, retryAfterOf } from "@/features/chat/model/runErrors";

import { streamRun } from "./runStream";

/* -------------------------------------------------------------------------- */
/* The shapes                                                                 */
/* -------------------------------------------------------------------------- */

/** The image the service stored, and where it put it. */
export interface GeneratedImage {
  url: string;
  sha256: string;
  width: number;
  height: number;
  mediaType: string;
  model: string;
  runId: string;
  createdAt: string;
}

/** What the run says while it works. */
export type ImageProgress = { phase: "queued"; position: number } | { phase: "generating" };

/** The end of a run: the image, or the reason there is none. */
export type ImageRunResult =
  | { ok: true; image: GeneratedImage }
  | { ok: false; code: string; retryAfterSeconds: number | null };

export interface ImageRunOptions {
  /** Opens the run's stream. It resolves when the stream ends — dropped or finished. */
  start: () => Promise<Response>;
  /** Re-opens the run's stream after `lastEventId` (undefined when nothing arrived yet). */
  resume: (lastEventId: string | undefined) => Promise<Response>;
  /** The progress of the run, as it happens. */
  onProgress?: (progress: ImageProgress) => void;
  /** Stops the run: an abort ends the stream without a resume. */
  signal?: AbortSignal;
  /** The waits between the resume attempts. */
  backoffMs?: readonly number[];
  /** The wait itself — injectable so a test does not spend real seconds. */
  sleep?: (ms: number) => Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* The guards                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The URL of a stored image: a bridge path, minted by the bridge.
 *
 * Defence in depth: the client NEVER renders a URL the bridge did not mint, so
 * a service (or a man in the middle) cannot make the editor show an image of
 * its own. The uuid is the upload's, the sha256 the bytes'.
 */
const STORED_IMAGE_URL = /^\/api\/media\/uploads\/[0-9a-f-]{36}\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/;

/** The sha256 of the stored bytes: 64 hex characters. */
const SHA256 = /^[0-9a-f]{64}$/;

/** The image of an `image.done` frame, when the frame carries a sound one. */
function readGeneratedImage(data: Record<string, unknown>): GeneratedImage | null {
  const url = data.url;
  if (typeof url !== "string" || !STORED_IMAGE_URL.test(url)) return null;
  const sha256 = data.sha256;
  if (typeof sha256 !== "string" || !SHA256.test(sha256)) return null;
  const width = data.width;
  const height = data.height;
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return null;
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return null;
  const mediaType = data.mediaType;
  const model = data.model;
  const runId = data.runId;
  const createdAt = data.createdAt;
  if (typeof mediaType !== "string" || mediaType.length === 0) return null;
  if (typeof model !== "string" || model.length === 0) return null;
  if (typeof runId !== "string" || runId.length === 0) return null;
  if (typeof createdAt !== "string" || createdAt.length === 0) return null;
  return { url, sha256, width, height, mediaType, model, runId, createdAt };
}

/** The code of an `error` frame: the service's own, when it carries one. */
function errorCodeOf(data: Record<string, unknown>): string {
  return typeof data.code === "string" ? data.code : "engine_failed";
}

/** The place of the run in the queue, when the frame says it. */
function queuePositionOf(data: Record<string, unknown>): number {
  return typeof data.position === "number" && Number.isFinite(data.position) ? data.position : 0;
}

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Runs an image to its end, resuming it when the connection drops.
 *
 * The rules: the first terminal frame decides (an `image.done` or an `error`);
 * an `image.done` whose URL the bridge did not mint is refused
 * (`invalid_image`); a refusal thrown by the service keeps its code and its
 * `Retry-After`; an abort is a cancellation, never a failure; a stream that
 * ends with neither an image nor an error is `engine_failed`.
 */
export async function runImage(options: ImageRunOptions): Promise<ImageRunResult> {
  let outcome: ImageRunResult | null = null;

  const decide = (result: ImageRunResult): void => {
    if (outcome === null) outcome = result;
  };

  try {
    await streamRun({
      start: options.start,
      resume: options.resume,
      signal: options.signal,
      backoffMs: options.backoffMs,
      sleep: options.sleep,
      onEvent: (event, data) => {
        if (outcome !== null) return;
        if (event === "image.queued") {
          options.onProgress?.({ phase: "queued", position: queuePositionOf(data) });
          return;
        }
        if (event === "image.started") {
          options.onProgress?.({ phase: "generating" });
          return;
        }
        if (event === "image.done") {
          const image = readGeneratedImage(data);
          decide(
            image
              ? { ok: true, image }
              : { ok: false, code: "invalid_image", retryAfterSeconds: null },
          );
          return;
        }
        if (event === "error") {
          decide({ ok: false, code: errorCodeOf(data), retryAfterSeconds: null });
        }
      },
    });
  } catch (error) {
    // A stop is not a failure: it is a cancellation.
    if (options.signal?.aborted) return { ok: false, code: "cancelled", retryAfterSeconds: null };
    return { ok: false, code: failureCode(error), retryAfterSeconds: retryAfterOf(error) };
  }

  if (options.signal?.aborted) return { ok: false, code: "cancelled", retryAfterSeconds: null };
  return outcome ?? { ok: false, code: "engine_failed", retryAfterSeconds: null };
}

/* -------------------------------------------------------------------------- */
/* The block                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The fields an image block carries once the image is there.
 *
 * The asset is the bridge's own URL (`url:` + the bridge base + the path the
 * service minted), the alt text says the image is AI-made, and the provenance
 * names the model, the run and the date — NEVER the prompt (devil C77).
 */
export function aiImageBlockFields(
  image: GeneratedImage,
  apiBase: string,
): {
  asset: string;
  mediaAlt: string;
  aiGenerated: { model: string; runId: string; createdAt: string };
} {
  return {
    asset: `url:${apiBase.replace(/\/+$/, "")}${image.url}`,
    mediaAlt: "AI-generated image",
    aiGenerated: { model: image.model, runId: image.runId, createdAt: image.createdAt },
  };
}
