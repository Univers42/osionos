/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiImageJobView.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * What an image block shows while its image is being made.
 *
 * Rendered INSTEAD of the empty placeholder while a job exists: the skeleton
 * and the progress while the engine works, the reason and the doors when it
 * failed. The reader hears the change (`role="status"`, `aria-live="polite"`).
 *
 * The prompt is never shown: the block carries the image and its provenance,
 * never what was asked for (devil C77).
 */

import React from "react";

import { useAiImageStore, type ImageJob } from "../model/aiImageStore";

interface AiImageJobViewProps {
  blockId: string;
  job: ImageJob;
}

/** The sentence of every failure the service can name. */
const MESSAGES: Record<string, string> = {
  prompt_required: "Describe the image after /imagine, for example: /imagine a lighthouse at dusk",
  prompt_too_long: "The description is too long — keep it under 1000 characters.",
  rate_limited: "Too many images this minute.",
  image_quota_exceeded: "You've reached today's image limit.",
  image_busy: "The image engine is busy. Try again in a moment.",
  budget_exhausted: "Today's AI budget is used up.",
  engine_unavailable: "The image engine isn't running.",
  timeout: "The image took too long.",
  storage_failed: "The image couldn't be saved.",
  not_found: "Image generation isn't available here.",
};

/** The sentence of a failure nobody wrote for. */
const DEFAULT_MESSAGE = "The image couldn't be generated.";

/** The failures a new run may answer differently: those get a "Try again". */
const RETRYABLE = new Set([
  "rate_limited",
  "image_busy",
  "engine_unavailable",
  "engine_failed",
  "timeout",
  "storage_failed",
  "invalid_image",
]);

const BUTTON =
  "inline-flex min-h-8 items-center justify-center rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40";

export const AiImageJobView: React.FC<AiImageJobViewProps> = ({ blockId, job }) => {
  const stop = useAiImageStore((state) => state.stop);
  const retry = useAiImageStore((state) => state.retry);
  const dismiss = useAiImageStore((state) => state.dismiss);

  if (job.status === "error") {
    const message = MESSAGES[job.code] ?? DEFAULT_MESSAGE;
    const countdown =
      job.code === "rate_limited" && typeof job.retryAfterSeconds === "number"
        ? ` Try again in ${job.retryAfterSeconds}s.`
        : "";
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="ai-image-job"
        className="flex flex-col items-start gap-2 rounded-lg px-3 py-3"
      >
        <p className="text-sm text-[var(--osio-fg-muted)]">
          {message}
          {countdown}
        </p>
        <div className="flex items-center gap-2">
          {RETRYABLE.has(job.code) ? (
            <button type="button" className={BUTTON} onClick={() => retry(blockId)}>
              Try again
            </button>
          ) : null}
          <button type="button" className={BUTTON} onClick={() => dismiss(blockId)}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  const waiting = job.status === "queued" && job.position > 0;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="ai-image-job"
      className="flex flex-col items-start gap-2 rounded-lg px-3 py-3"
    >
      <div
        aria-hidden
        className="aspect-square w-full max-w-[512px] animate-pulse rounded-lg bg-[var(--osio-bg-subtle)] motion-reduce:animate-none"
      />
      <p className="text-sm text-[var(--osio-fg-muted)]">
        {waiting ? `Waiting for the image engine — ${job.position} ahead` : "Generating image…"}
      </p>
      <button type="button" className={BUTTON} onClick={() => stop(blockId)}>
        Stop
      </button>
    </div>
  );
};
