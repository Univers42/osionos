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

// One index build per queue drain, not per created file (18/20). A lone create
// rebuilds the workspace's index and tables (~20 ms at 10 000 pages), so a
// 500-file checkout cost ~12 s. Here a socket event whose whole plan is one
// create is DEFERRED: its folder is resolved now, the page waits, and one flush
// task — queued behind the events already waiting — makes the batch. Anything
// that could tell the difference runs after a flush: a write at or under a
// deferred path (before planning), any plan that is not a lone create — a
// delete included — (flushed, then re-planned), and attach's direct `run`.

import { childDirOfPath } from "@/features/page-file/model/outboundPlan";
import { createPagesBatch } from "@/features/page-file/model/pageFileBatchCreate";
import { ideOutput } from "./ideOutputBus";
import { recordSyncedHash } from "./ideSyncEngine";
import { executeSteps, failureLine, type ExecContext, type ExecOutcome } from "./inboundExec";
import { ensureDirPage, splitPath } from "./inboundExecTree";
import { planInbound, type InboundEvent, type InboundStep } from "./inboundPlan";

import type { PageFileStore } from "@/features/page-file/model/pageFileFacade";
import type { ReadableViews } from "@/features/page-file/model/pageFileFacadeViews";

type CreateStep = Extract<InboundStep, { op: "create" }>;
type Deferred = { step: CreateStep; parentId: string | null; name: string };

export interface DrainDeps {
  store: PageFileStore;
  views: ReadableViews;
  ctx: ExecContext;
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
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Ponytail: the batch is what was queued when its first create ran — a socket
 * message's lines. An agent that sends one line per message gets one flush per
 * event (no gain, no loss). A deferred page appears at the flush, not at its own
 * event, and the live store's addPage awaits the server per page — the batch
 * removes the index rebuilds, not those round trips.
 */
export function createInboundDrain(deps: DrainDeps): InboundDrain {
  let batch: Deferred[] = [];
  const held = new Set<string>();
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const items = batch;
    batch = [];
    held.clear();
    await makeBatch(deps, items);
  };
  const run = async (event: InboundEvent): Promise<ExecOutcome> => {
    await flush();
    return executeSteps(await planInbound(event, deps.ctx.view), event.path, deps.ctx);
  };
  const defer = async (step: CreateStep): Promise<void> => {
    const { dir, name } = splitPath(step.path);
    try {
      const parentId = await ensureDirPage(dir, deps.ctx);
      if (batch.length === 0) deps.enqueue(flush);
      batch.push({ step, parentId, name });
      held.add(step.path.toLowerCase());
      held.add(childDirOfPath(step.kind, step.path).toLowerCase());
    } catch (error) {
      ideOutput("fs-sync", failureLine(step, step.path, messageOf(error)));
    }
  };
  return {
    flush,
    run,
    async handle(event) {
      if (batch.length > 0 && isHeld(held, event.path)) await flush();
      const steps = await planInbound(event, deps.ctx.view);
      const only = steps.length === 1 ? steps[0] : undefined;
      if (only?.op === "create") return defer(only);
      if (batch.length > 0) await run(event);
      else await executeSteps(steps, event.path, deps.ctx);
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

/** One batch create; each page that landed gets its ledger, each refusal its create line. */
async function makeBatch(deps: DrainDeps, items: readonly Deferred[]): Promise<void> {
  const inputs = items.map(({ step, parentId, name }) => ({ title: name, parentId, kind: "file" as const, content: step.text }));
  try {
    const results = await createPagesBatch(deps.store, deps.views, inputs);
    for (const [at, result] of results.entries()) {
      const { step } = items[at];
      if ("page" in result) recordSyncedHash(deps.ctx.workspaceId, step.path, step.hash);
      else ideOutput("fs-sync", failureLine(step, step.path, result.error));
    }
  } catch (error) {
    for (const { step } of items) ideOutput("fs-sync", failureLine(step, step.path, messageOf(error)));
  }
}
