/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiImageStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The image jobs of the editor: what is being made, and what went wrong.
 *
 * The state is IN MEMORY, keyed by block id, and it is never persisted: the
 * block itself is written every ~800 ms, so a persisted "pending" flag would
 * show a skeleton forever after a reload or a closed tab. The block stays a
 * plain empty image block until the image is there; a job that died with the
 * tab leaves the normal "Add an image" placeholder.
 *
 * The AbortControllers and the callbacks live in a module-level Map — the
 * state stays plain data.
 *
 * The PROMPT never leaves this module: it is kept in the Map, in memory, for
 * the retry button only (devil C77). It is never in the state, never in the
 * block, never in the storage.
 */

import { create } from "zustand";

import { cancelRun, resumeRun, startImage } from "../api/aiClient";

import { runImage, type GeneratedImage } from "./imageRun";

/* -------------------------------------------------------------------------- */
/* The shapes                                                                 */
/* -------------------------------------------------------------------------- */

/** Where a job stands. */
export type ImageJob =
  | { status: "queued"; position: number; runId: string }
  | { status: "generating"; runId: string }
  | { status: "error"; code: string; retryAfterSeconds: number | null };

/** The run in flight of one block — MEMORY ONLY. */
interface ImageRun {
  runId: string;
  /** The prompt, kept for the retry button and for nothing else. */
  prompt: string;
  /** What fills the block when the image is there. */
  onDone: (image: GeneratedImage) => void;
  controller: AbortController;
}

/** The runs in flight, by block id. Never persisted. */
const runs = new Map<string, ImageRun>();

/** The longest prompt the service accepts. */
const MAX_PROMPT_CHARS = 1000;

export interface AiImageState {
  /** The jobs of the editor, by block id. */
  jobs: Record<string, ImageJob>;
  /** Makes an image for a block: the block is empty until the image is there. */
  generate: (blockId: string, prompt: string, onDone: (image: GeneratedImage) => void) => Promise<void>;
  /** Stops the run of a block: the abort, the cancel, and the job is gone. */
  stop: (blockId: string) => void;
  /** Runs the same prompt again — with a NEW run id (a re-POST would replay). */
  retry: (blockId: string) => void;
  /** Throws the job away: the state and the prompt are gone. */
  dismiss: (blockId: string) => void;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

export const useAiImageStore = create<AiImageState>((set, get) => {
  /** The job of a block, written. */
  const setJob = (blockId: string, job: ImageJob): void => {
    set((state) => ({ jobs: { ...state.jobs, [blockId]: job } }));
  };

  /** The job of a block, gone. */
  const removeJob = (blockId: string): void => {
    set((state) => {
      if (!state.jobs[blockId]) return {};
      const jobs = { ...state.jobs };
      delete jobs[blockId];
      return { jobs };
    });
  };

  return {
    jobs: {},

    generate: async (blockId, prompt, onDone) => {
      const clean = prompt.trim();
      if (clean.length === 0) {
        setJob(blockId, { status: "error", code: "prompt_required", retryAfterSeconds: null });
        return;
      }
      if (clean.length > MAX_PROMPT_CHARS) {
        setJob(blockId, { status: "error", code: "prompt_too_long", retryAfterSeconds: null });
        return;
      }

      const runId = globalThis.crypto.randomUUID();
      const controller = new AbortController();
      runs.set(blockId, { runId, prompt: clean, onDone, controller });
      setJob(blockId, { status: "queued", position: 0, runId });

      const result = await runImage({
        start: () => startImage({ runId, prompt: clean }, controller.signal),
        resume: (lastEventId) => resumeRun(runId, lastEventId, controller.signal),
        onProgress: (progress) => {
          // A job that was stopped or dismissed stays gone: no progress may
          // bring it back.
          if (!get().jobs[blockId]) return;
          setJob(
            blockId,
            progress.phase === "queued"
              ? { status: "queued", position: progress.position, runId }
              : { status: "generating", runId },
          );
        },
        signal: controller.signal,
      });

      // A newer run took the block over while this one was running: this one
      // has nothing left to say.
      const run = runs.get(blockId);
      if (!run || run.controller !== controller) return;

      if (result.ok) {
        removeJob(blockId);
        runs.delete(blockId);
        run.onDone(result.image);
        return;
      }
      if (result.code === "cancelled") {
        // A stop is not a failure: the job is gone, the prompt stays for a retry.
        removeJob(blockId);
        return;
      }
      setJob(blockId, { status: "error", code: result.code, retryAfterSeconds: result.retryAfterSeconds });
    },

    stop: (blockId) => {
      const run = runs.get(blockId);
      if (run) {
        run.controller.abort();
        // The cancel is a courtesy: the run may already be over, and its
        // failure must not reach the user.
        void cancelRun(run.runId).catch(() => undefined);
      }
      removeJob(blockId);
    },

    retry: (blockId) => {
      const run = runs.get(blockId);
      if (!run) return;
      // A NEW run id: a re-POST with the same one would replay the old run.
      void get().generate(blockId, run.prompt, run.onDone);
    },

    dismiss: (blockId) => {
      runs.delete(blockId);
      removeJob(blockId);
    },
  };
});
