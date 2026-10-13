/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundSession.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One inbound session per sync effect and leadership: the facade, the view and
// the pending state built ONCE (B5), and the two ways an event gets in — a
// socket event through the queue, or attach's reconcile calling `run` directly.

import { createPageFileFacade } from "@/features/page-file/model/pageFileFacade";
import { createReadableViews } from "@/features/page-file/model/pageFileFacadeViews";
import { sha16, type FsEvent } from "./ideFsEcho";
import { ideOutput } from "./ideOutputBus";
import { createInboundDrain } from "./inboundDrain";
import { createInboundPending, type Schedule } from "./inboundPending";
import { decodeUtf8Strict, type SerialQueue } from "./inboundPipeline";
import { createInboundView, type ExecView } from "./inboundView";

import type { PageFileStore } from "@/features/page-file/model/pageFileFacade";
import type { ExecContext, ExecOutcome } from "./inboundExec";
import type { InboundEvent } from "./inboundPlan";
import type { PageFacade } from "../vfs/pageProvider";
import type { StatResult } from "./inboundArchive";

export type { StatResult } from "./inboundArchive";

export interface InboundSessionDeps {
  workspaceId: string;
  store: PageFileStore;
  restore(pageId: string): Promise<void>;
  /** The sandbox's answer for one workspace path. */
  stat(path: string): Promise<StatResult>;
  schedule: Schedule;
  /** Puts a task on the event queue; never awaited from inside one (B8). */
  enqueue(task: () => Promise<void>): void;
}

export interface InboundSession {
  readonly view: ExecView;
  readonly facade: PageFacade;
  /** One fs-agent write/delete: decoded, planned, executed. Never throws (24). */
  handle(evt: FsEvent): Promise<void>;
  /** Plan + execute one decoded event, for a caller already inside the queue (attach, D1). */
  run(event: InboundEvent): Promise<ExecOutcome>;
  /** Drops the timers and the restore memory (B5). */
  dispose(): void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createInboundSession(deps: InboundSessionDeps): InboundSession {
  const views = createReadableViews(deps.store);
  const facade = createPageFileFacade(deps.store, views);
  const pending = createInboundPending({ schedule: deps.schedule, enqueue: deps.enqueue });
  const view = createInboundView({ workspaceId: deps.workspaceId, store: deps.store, views, pending, readText: (id) => facade.readContent(id) });
  const ctx: ExecContext = { workspaceId: deps.workspaceId, facade, view, pending, restore: deps.restore, stat: deps.stat };
  const drain = createInboundDrain({ store: deps.store, views, ctx, enqueue: deps.enqueue });
  return {
    view,
    facade,
    async handle(evt) {
      try {
        const decoded = await decodeFsEvent(evt);
        if (decoded === null) return;
        if ("skip" in decoded) ideOutput("fs-sync", decoded.skip);
        else await drain.handle(decoded);
      } catch (error) {
        ideOutput("fs-sync", `${evt.path}: event skipped — ${messageOf(error)}`);
      }
    },
    run: drain.run,
    dispose: () => pending.dispose(),
  };
}

export interface FsEventRoute {
  isLeader(): boolean;
  queue: SerialQueue;
  session: InboundSession;
  /** The "ready" task: reconcile the whole tree; it runs inside the queue. */
  attach(): Promise<void>;
}

/** One parsed socket event onto the queue — leader tab only, since the bridge
 *  runs one fs-agent per socket and every open tab hears every event. O(1). */
export function routeFsEvent(evt: FsEvent, route: FsEventRoute): void {
  if (!route.isLeader()) return;
  void route.queue.run(evt.event === "ready" ? route.attach : () => route.session.handle(evt));
}

/**
 * write → its text, strictly UTF-8 (condition 20: a non-text file never reaches
 * a page as replacement characters), and the agent's hash; delete as is; any
 * other kind (ready, unknown) is not this function's. O(len(content)).
 */
async function decodeFsEvent(evt: FsEvent): Promise<InboundEvent | { skip: string } | null> {
  if (evt.event === "delete") return { kind: "delete", path: evt.path };
  if (evt.event !== "write") return null;
  if (typeof evt.content !== "string") return { skip: `${evt.path}: not synced — no text content (binary, or over the agent's size cap)` };
  const text = decodeUtf8Strict(evt.content);
  if (text === null) return { skip: `${evt.path}: not synced — not UTF-8 text` };
  return { kind: "write", path: evt.path, text, hash: evt.hash ?? (await sha16(text)) };
}
