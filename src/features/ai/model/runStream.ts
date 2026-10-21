/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   runStream.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The run stream: open it, relay it, and pick it up again when it drops.
 *
 * The service streams a run over SSE and numbers every frame. When the
 * connection dies before the terminal frame (`done` / `error`), the run itself
 * is still alive on the service: `GET /runs/:runId/events` replays everything
 * after the last frame we saw. That is what this module is for — it holds the
 * cursor, resumes at most three times, and never hands the same frame twice.
 *
 * Pure logic: the caller brings the two openers and the sink, so the whole
 * thing is testable without a server and without a browser.
 */

import { pumpSseStream, type StreamPayload } from "@osionos/http-gate";

/** The sink every frame of the run reaches. `id` is the frame's id, when it has one. */
export type RunEventSink = (event: string, data: StreamPayload, id?: string) => void;

/** The frames that end a run. After one of them there is nothing to resume. */
const TERMINAL_EVENTS = new Set(["done", "error"]);

/** The waits between two resume attempts. */
const DEFAULT_BACKOFF_MS = [500, 1000, 2000] as const;

export interface StreamRunOptions {
  /** Opens the run's stream. It resolves when the stream ends — dropped or finished. */
  start: () => Promise<Response>;
  /** Re-opens the run's stream after `lastEventId` (undefined when nothing arrived yet). */
  resume: (lastEventId: string | undefined) => Promise<Response>;
  /** Receives every frame, in order, exactly once. */
  onEvent: RunEventSink;
  /** Stops the run: an abort ends the stream without a resume. */
  signal?: AbortSignal;
  /** The waits between the resume attempts. */
  backoffMs?: readonly number[];
  /** The wait itself — injectable so a test does not spend real seconds. */
  sleep?: (ms: number) => Promise<void>;
}

/** The status and the code of a refusal, when the failure carries them. */
function failureOf(error: unknown): { status?: number; code?: string } {
  if (typeof error !== "object" || error === null) return {};
  const candidate = error as { status?: unknown; code?: unknown };
  return {
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
  };
}

/** The service refuses a resume of a run whose stream is gone: 410 `run_expired`. */
function isRunExpired(error: unknown): boolean {
  const { status, code } = failureOf(error);
  return status === 410 || code === "run_expired";
}

/**
 * Runs a run to its end, resuming it when the connection drops.
 *
 * The rules, in order: relay every frame exactly once; when the stream ends
 * before a terminal frame, resume after the last frame seen (up to three
 * times, waiting 500 / 1000 / 2000 ms); a 410 on resume ends the run with
 * `run_expired`; three failed resumes end the run with an error too. An abort
 * ends everything quietly — that is a stop, not a failure.
 */
export async function streamRun(options: StreamRunOptions): Promise<void> {
  const { start, resume, onEvent, signal } = options;
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  const delivered = new Set<string>();
  let lastEventId: string | undefined;
  let terminal = false;
  let failure: unknown;

  const relay = async (response: Response): Promise<void> => {
    await pumpSseStream(response, (event, data, id) => {
      if (id !== undefined) {
        if (delivered.has(id)) return; // the same frame, never twice
        delivered.add(id);
        lastEventId = id;
      }
      if (TERMINAL_EVENTS.has(event)) terminal = true;
      onEvent(event, data, id);
    });
  };

  for (let attempt = 0; ; attempt += 1) {
    if (signal?.aborted) return;

    try {
      const response = attempt === 0 ? await start() : await resume(lastEventId);
      await relay(response);
    } catch (error) {
      if (signal?.aborted) return;
      failure = error;
      // A run whose stream is gone cannot be picked up again — say so, once.
      if (attempt > 0 && isRunExpired(error)) {
        onEvent("error", { code: "run_expired", message: "This run expired and cannot be resumed." });
        return;
      }
    }

    if (terminal || signal?.aborted) return;

    // The stream ended without a terminal frame: the run is still alive.
    if (attempt >= backoff.length) {
      const code = failureOf(failure).code ?? "resume_failed";
      onEvent("error", {
        code,
        message: "The connection dropped and the run could not be resumed.",
      });
      return;
    }

    await sleep(backoff[attempt]);
  }
}
