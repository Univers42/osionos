/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   previewParseQueue.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One preview's parse worker (devil verdict 2026-11-07 editor-page preview, EP21–EP25).
// One request runs at a time; a newer source replaces the single pending one, so typing
// faster than the parse never queues work or churns workers. Every request ends in one
// state: a result, tooSlow (the budget killed the worker), or unavailable.
import type { ImagePolicy, PreviewDocument, PreviewRequest, PreviewResponse } from "./previewDocument";

/**
 * Caveat: timed on an i5-13600KF, where 1 MiB of the engine's testing_markdown.md parses in
 * 34–48 ms. A device many times slower, on ~1 MiB of dense tables, can hit it and be told
 * the file takes too long when it would have parsed. The Code view still edits it.
 */
export const PREVIEW_PARSE_BUDGET_MS = 3000;

export type PreviewState =
  | { kind: "waiting" }
  | { kind: "ready"; document: PreviewDocument }
  | { kind: "tooSlow" }
  | { kind: "unavailable" };

type Job = { source: string; images: ImagePolicy };

const sameJob = (a: Job | null, b: Job): boolean => a?.source === b.source && a.images === b.images;

export class PreviewParseQueue {
  private readonly createWorker: () => Worker;
  private readonly onState: (state: PreviewState) => void;
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: number | null = null;
  private pending: Job | null = null;
  private wanted: Job | null = null;
  private nextId = 0;
  private closed = false;

  constructor(createWorker: () => Worker, onState: (state: PreviewState) => void) {
    this.createWorker = createWorker;
    this.onState = onState;
  }

  /** A source equal to the last one asked for posts nothing. */
  request(source: string, images: ImagePolicy): void {
    const job = { source, images };
    if (this.closed || sameJob(this.wanted, job)) return;
    this.wanted = job;
    if (this.inFlight === null) this.send(job);
    else this.pending = job;
  }

  /** Terminates the worker, clears the timer and removes the listeners; nothing reports after. */
  dispose(): void {
    this.closed = true;
    this.pending = null;
    this.stop();
  }

  private send(job: Job): void {
    const worker = this.worker ?? this.spawn();
    if (worker === null) return this.fail();
    this.nextId += 1;
    this.inFlight = this.nextId;
    // Armed before the post: the budget covers exactly the request the worker runs.
    this.timer = setTimeout(() => this.expire(), PREVIEW_PARSE_BUDGET_MS);
    worker.postMessage({ id: this.nextId, ...job } satisfies PreviewRequest);
  }

  private spawn(): Worker | null {
    let worker: Worker;
    try {
      worker = this.createWorker();
    } catch {
      return null;
    }
    worker.onmessage = (event: MessageEvent<PreviewResponse>) => this.receive(event.data);
    worker.onerror = () => this.fail();
    worker.onmessageerror = () => this.fail();
    this.worker = worker;
    return worker;
  }

  private receive(response: PreviewResponse): void {
    if (response.id !== this.inFlight) return;
    this.clearTimer();
    this.inFlight = null;
    this.onState({ kind: "ready", document: response.document });
    this.sendPending();
  }

  private expire(): void {
    this.timer = null;
    this.stop();
    this.onState({ kind: "tooSlow" });
    this.sendPending();
  }

  // A worker that cannot load or answer will not do better on the next keystroke: the
  // preview stays unavailable until it is reopened (a new queue).
  private fail(): void {
    this.dispose();
    this.onState({ kind: "unavailable" });
  }

  private sendPending(): void {
    const job = this.pending;
    this.pending = null;
    if (job !== null) this.send(job);
  }

  private stop(): void {
    this.clearTimer();
    this.inFlight = null;
    const worker = this.worker;
    this.worker = null;
    if (worker === null) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
