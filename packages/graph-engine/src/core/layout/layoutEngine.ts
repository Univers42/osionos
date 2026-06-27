/**
 * The DOM-free engine that drives `ForceLayout` on a `setInterval` tick loop and
 * streams positions out via an injected `emit`. Shared verbatim by the Web Worker
 * (`layout.worker.ts`) and the main-thread fallback (`layoutBridge.ts`), so the
 * physics lives in exactly one place. Fresh position buffers per frame let the
 * worker path transfer them zero-copy; the loop stops when the layout settles.
 */

import { ALPHA_SETTLED, ForceLayout, type LayoutLink } from "./forceLayout";
import type { LayoutParams } from "./params";

const TICK_MS = 16;
// Hard cap on ticks per (re)heat — guarantees the layout goes static within a
// bounded time even at tens of thousands of nodes, so it never churns forever.
// The pre-seeded database clusters mean fewer ticks are needed to converge.
const MAX_TICKS = 160;

export interface LayoutInitMessage {
  t: "init";
  count: number;
  links: LayoutLink[];
  width: number;
  height: number;
  params: LayoutParams;
  seedX: Float32Array | null;
  seedY: Float32Array | null;
  /** Per-node database/mount group id for visual clustering (optional). */
  nodeGroups?: Uint8Array | null;
}
export interface LayoutPinMessage { t: "pin"; index: number; x: number; y: number }
export interface LayoutUnpinMessage { t: "unpin"; index: number }
export interface LayoutReheatMessage { t: "reheat"; alpha: number }
export interface LayoutParamsMessage { t: "params"; params: LayoutParams }
export interface LayoutStopMessage { t: "stop" }
export type LayoutInbound =
  | LayoutInitMessage
  | LayoutPinMessage
  | LayoutUnpinMessage
  | LayoutReheatMessage
  | LayoutParamsMessage
  | LayoutStopMessage;

export interface LayoutPositionsMessage { t: "positions"; x: Float32Array; y: Float32Array; alpha: number }
export interface LayoutSettledMessage { t: "settled" }
export type LayoutOutbound = LayoutPositionsMessage | LayoutSettledMessage;

/** Emit an outbound message, optionally transferring buffers (worker path). */
export type EmitFn = (message: LayoutOutbound, transfer?: Transferable[]) => void;

export class LayoutEngine {
  private layout: ForceLayout | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;

  constructor(private readonly emit: EmitFn) {}

  handle(message: LayoutInbound): void {
    switch (message.t) {
      case "init":
        this.init(message);
        break;
      case "pin":
        this.layout?.pin(message.index, message.x, message.y);
        this.layout?.reheat(0.3);
        this.start();
        break;
      case "unpin":
        this.layout?.unpin(message.index);
        break;
      case "reheat":
        this.layout?.reheat(message.alpha);
        this.start();
        break;
      case "params":
        this.layout?.setParams(message.params);
        this.start();
        break;
      case "stop":
        this.stop();
        break;
    }
  }

  dispose(): void {
    this.stop();
    this.layout = null;
  }

  private init(message: LayoutInitMessage): void {
    this.stop();
    this.layout = new ForceLayout({
      count: message.count,
      links: message.links,
      width: message.width,
      height: message.height,
      params: message.params,
      seedX: message.seedX,
      seedY: message.seedY,
      nodeGroups: message.nodeGroups,
    });
    if (message.count === 0) {
      this.emit({ t: "settled" });
      return;
    }
    this.start();
  }

  private start(): void {
    if (this.timer != null || !this.layout) return;
    this.ticks = 0;
    this.timer = setInterval(() => this.step(), TICK_MS);
  }

  private stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private step(): void {
    const layout = this.layout;
    if (!layout) return;
    layout.tick();
    this.ticks += 1;

    const x = new Float32Array(layout.count);
    const y = new Float32Array(layout.count);
    layout.readPositions(x, y);
    this.emit({ t: "positions", x, y, alpha: layout.alpha() }, [x.buffer, y.buffer]);

    if (layout.alpha() < ALPHA_SETTLED || this.ticks >= MAX_TICKS) {
      this.stop();
      this.emit({ t: "settled" });
    }
  }
}
