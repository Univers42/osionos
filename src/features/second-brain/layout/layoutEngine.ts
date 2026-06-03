/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutEngine.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ALPHA_SETTLED, ForceLayout, type LayoutLink } from "./forceLayout";

/**
 * The DOM-free engine that drives `ForceLayout` on a `setInterval` tick loop and
 * streams positions out via an injected `emit`. It is shared verbatim by the Web
 * Worker (`layout.worker.ts`) and the main-thread fallback (`layoutBridge.ts`),
 * so the physics code lives in exactly one place (doc 04 §3).
 *
 * It allocates fresh position buffers per posted frame so the worker path can
 * transfer them zero-copy; the loop stops when the layout settles, so idle costs
 * nothing on either thread.
 */

const TICK_MS = 16;

export interface LayoutInitMessage {
  t: "init";
  count: number;
  links: LayoutLink[];
  width: number;
  height: number;
  seedX: Float32Array | null;
  seedY: Float32Array | null;
}
export interface LayoutPinMessage { t: "pin"; index: number; x: number; y: number }
export interface LayoutUnpinMessage { t: "unpin"; index: number }
export interface LayoutReheatMessage { t: "reheat"; alpha: number }
export interface LayoutStopMessage { t: "stop" }
export type LayoutInbound =
  | LayoutInitMessage
  | LayoutPinMessage
  | LayoutUnpinMessage
  | LayoutReheatMessage
  | LayoutStopMessage;

export interface LayoutPositionsMessage { t: "positions"; x: Float32Array; y: Float32Array; alpha: number }
export interface LayoutSettledMessage { t: "settled" }
export type LayoutOutbound = LayoutPositionsMessage | LayoutSettledMessage;

/** Emit an outbound message, optionally transferring buffers (worker path). */
export type EmitFn = (message: LayoutOutbound, transfer?: Transferable[]) => void;

export class LayoutEngine {
  private layout: ForceLayout | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

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
      seedX: message.seedX,
      seedY: message.seedY,
    });
    if (message.count === 0) {
      this.emit({ t: "settled" });
      return;
    }
    this.start();
  }

  private start(): void {
    if (this.timer != null || !this.layout) return;
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

    const x = new Float32Array(layout.count);
    const y = new Float32Array(layout.count);
    layout.readPositions(x, y);
    this.emit({ t: "positions", x, y, alpha: layout.alpha() }, [x.buffer, y.buffer]);

    if (layout.alpha() < ALPHA_SETTLED) {
      this.stop();
      this.emit({ t: "settled" });
    }
  }
}
