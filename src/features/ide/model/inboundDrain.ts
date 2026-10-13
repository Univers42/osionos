/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundDrain.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One index build per batch of created files, not per file (18/20). A lone create
// rebuilds the workspace's index and tables (~20 ms at 10 000 pages), so a
// 500-file checkout cost ~12 s. Here a socket event whose whole plan is one
// create is DEFERRED: its folder is resolved now, the page waits for the flush —
// queued when the flush window ends (inboundFlushWindow, C3b5 P1), made inline at
// FLUSH_MAX_CREATES. Anything that could tell the difference runs after a flush: a
// write at or under a deferred path (before planning) unless it re-plans as the
// same lone create (it then replaces that create), any plan that is not a lone
// create — a delete included — (flushed, then re-planned), attach's direct `run`,
// and an archive re-check (ExecContext.settle).

import { childDirOfPath } from "@/features/page-file/model/outboundPlan";
import { createPagesBatch } from "@/features/page-file/model/pageFileBatchCreate";
import { ideOutput } from "./ideOutputBus";
import { recordSyncedHash } from "./ideSyncEngine";
import { executeSteps, failureLine, type ExecContext, type ExecOutcome } from "./inboundExec";
import { ensureDirPage, splitPath } from "./inboundExecTree";
import { createFlushWindow } from "./inboundFlushWindow";
import { planInbound, type InboundEvent, type InboundStep } from "./inboundPlan";

import type { PageFileStore } from "@/features/page-file/model/pageFileFacade";
import type { ReadableViews } from "@/features/page-file/model/pageFileFacadeViews";
import type { Schedule } from "./inboundPending";

type CreateStep = Extract<InboundStep, { op: "create" }>;
type Deferred = { step: CreateStep; parentId: string | null; name: string };

/** A batch this size is made at once: it bounds one flush's main-thread time.
 *  Ponytail: sized on the fixture store (256 creates over 64 directories, 21–25 ms
 *  against C1.4's 50 ms, inbound-burst.bench.ts); new directories and the live store's
 *  round trips are outside that number, so a flush there can run past 50 ms. */
export const FLUSH_MAX_CREATES = 256;

export interface DrainDeps {
  store: PageFileStore;
  views: ReadableViews;
  ctx: ExecContext;
  schedule: Schedule;
  /** Puts the flush on the event queue; never awaited from inside one (B8). */
  enqueue(task: () => Promise<void>): void;
}

export interface InboundDrain {
  /** A socket event: a lone create waits for the flush, anything else runs now. */
  handle(event: InboundEvent): Promise<void>;
  /** For a caller already inside the queue (attach, D1): flush, plan, execute. */
  run(event: InboundEvent): Promise<ExecOutcome>;
  /** Makes every deferred page in one batch. */
  flush(): Promise<void>;
  /** Stops the window and queues the flush: a deferred create survives the session (C1.1). */
  dispose(): void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const loneCreate = (steps: readonly InboundStep[]): CreateStep | undefined => (steps.length === 1 && steps[0].op === "create" ? steps[0] : undefined);

/**
 * Ponytail: a deferred page appears at the flush, up to FLUSH_MAX_MS after its own
 * event (longer in a throttled hidden tab), and the live store's addPage awaits the
 * server per page — the batch removes the index rebuilds, not those round trips.
 */
export function createInboundDrain(deps: DrainDeps): InboundDrain {
  let batch: Deferred[] = [];
  const held = new Set<string>();
  const slots = new Map<string, number>();
  let queued = false;
  let disposed = false;
  const queueFlush = (): void => {
    if (queued) return;
    queued = true;
    deps.enqueue(async () => {
      queued = false;
      await flush();
    });
  };
  const flushWindow = createFlushWindow({ schedule: deps.schedule, due: queueFlush });
  const flush = async (): Promise<void> => {
    flushWindow.stop();
    if (batch.length === 0) return;
    const items = batch;
    batch = [];
    held.clear();
    slots.clear();
    await makeBatch(deps, items);
  };
  // A queued flush already covers this create (it runs after the event in hand);
  // after dispose no timer is armed, the flush is queued as it was before P1.
  const noteCreate = async (): Promise<void> => {
    if (batch.length >= FLUSH_MAX_CREATES) await flush();
    else if (disposed) queueFlush();
    else if (!queued) flushWindow.touch();
  };
  const run = async (event: InboundEvent): Promise<ExecOutcome> => {
    await flush();
    return executeSteps(await planInbound(event, deps.ctx.view), event.path, deps.ctx);
  };
  const defer = async (step: CreateStep): Promise<void> => {
    const { dir, name } = splitPath(step.path);
    try {
      const parentId = await ensureDirPage(dir, deps.ctx);
      slots.set(step.path, batch.length);
      batch.push({ step, parentId, name });
      held.add(step.path.toLowerCase());
      held.add(childDirOfPath(step.kind, step.path).toLowerCase());
    } catch (error) {
      ideOutput("fs-sync", failureLine(step, step.path, messageOf(error)));
      return;
    }
    await noteCreate();
  };
  // The page was never seen by anyone: a newer write at its exact path that still
  // plans as a lone create IS the file now, so it replaces the deferred step (R2).
  const replaced = async (event: InboundEvent): Promise<boolean> => {
    const at = slots.get(event.path);
    if (event.kind !== "write" || at === undefined) return false;
    const step = loneCreate(await planInbound(event, deps.ctx.view));
    if (step === undefined || step.path !== event.path) return false;
    batch[at] = { ...batch[at], step };
    await noteCreate();
    return true;
  };
  return {
    flush,
    run,
    async handle(event) {
      if (batch.length > 0 && isHeld(held, event.path)) {
        if (await replaced(event)) return;
        await flush();
      }
      const steps = await planInbound(event, deps.ctx.view);
      const step = loneCreate(steps);
      if (step !== undefined) return defer(step);
      if (batch.length > 0) await run(event);
      else await executeSteps(steps, event.path, deps.ctx);
    },
    dispose() {
      disposed = true;
      flushWindow.stop();
      if (batch.length > 0) queueFlush();
    },
  };
}

/** `path`, or a directory above it, is a deferred file or its children dir (case-folded). O(depth). */
function isHeld(held: ReadonlySet<string>, path: string): boolean {
  const lower = path.toLowerCase();
  for (let cut = lower.indexOf("/"); cut > 0; cut = lower.indexOf("/", cut + 1)) {
    if (held.has(lower.slice(0, cut))) return true;
  }
  return held.has(lower);
}

/** One batch create; each page that landed gets its ledger (and its landed page hash,
 *  read back through the store: the returned object predates the front-matter patch). */
async function makeBatch(deps: DrainDeps, items: readonly Deferred[]): Promise<void> {
  const inputs = items.map(({ step, parentId, name }) => ({ title: name, parentId, kind: "file" as const, content: step.text }));
  try {
    const results = await createPagesBatch(deps.store, deps.views, inputs);
    for (const [at, result] of results.entries()) {
      const { step } = items[at];
      if (!("page" in result)) {
        ideOutput("fs-sync", failureLine(step, step.path, result.error));
        continue;
      }
      recordSyncedHash(deps.ctx.workspaceId, step.path, step.hash);
      await deps.ctx.landed.remember(step.path, step.hash, result.page._id);
    }
  } catch (error) {
    for (const { step } of items) ideOutput("fs-sync", failureLine(step, step.path, messageOf(error)));
  }
}
