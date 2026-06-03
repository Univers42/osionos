/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutBridge.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { GraphModel, NodeId } from "../model/graphModel";
import { type LayoutLink, seedPositions } from "./forceLayout";
import {
  type LayoutInbound,
  type LayoutOutbound,
  LayoutEngine,
} from "./layoutEngine";

/**
 * Main-thread side of the layout split (doc 04 §3). Owns the stable
 * nodeId↔index mapping, builds the link list from a `GraphModel`, and preserves
 * positions across rebuilds (so editing keeps the graph from teleporting). It
 * runs the worker when available and transparently falls back to an in-process
 * `LayoutEngine` (tests / no-Worker environments) — the API is identical.
 */

export interface LayoutControllerOptions {
  width: number;
  height: number;
  onPositions: (x: Float32Array, y: Float32Array, alpha: number, idList: readonly NodeId[]) => void;
  onSettled?: () => void;
}

const DEFAULT_REHEAT = 0.35;

export class LayoutController {
  private readonly worker: Worker | null;
  private readonly fallback: LayoutEngine | null;

  private idList: NodeId[] = [];
  private idToIndex = new Map<NodeId, number>();
  /** Latest positions for the *current* idList (consumed for rebuild seeding). */
  private lastX: Float32Array | null = null;
  private lastY: Float32Array | null = null;

  constructor(private readonly options: LayoutControllerOptions) {
    const worker = createWorker();
    if (worker) {
      this.worker = worker;
      this.fallback = null;
      worker.onmessage = (event: MessageEvent<LayoutOutbound>) => this.onOutbound(event.data);
    } else {
      this.worker = null;
      this.fallback = new LayoutEngine((message) => this.onOutbound(message));
    }
  }

  /** (Re)build the layout from a model, preserving positions of surviving nodes. */
  rebuild(model: GraphModel): void {
    const snapshot = this.snapshotPositions();

    this.idList = model.nodes.map((node) => node.id);
    this.idToIndex = new Map(this.idList.map((id, index) => [id, index]));

    const seeds = seedPositions(this.idList.length, this.options.width, this.options.height);
    for (let i = 0; i < this.idList.length; i += 1) {
      const previous = snapshot.get(this.idList[i]);
      if (previous) {
        seeds.x[i] = previous.x;
        seeds.y[i] = previous.y;
      }
    }

    const links: LayoutLink[] = [];
    for (const edge of model.edges) {
      const source = this.idToIndex.get(edge.source);
      const target = this.idToIndex.get(edge.target);
      if (source !== undefined && target !== undefined) {
        links.push({ source, target, strength: edge.strength });
      }
    }

    // Seeds are cloned (not transferred) so we can echo them as frame 0 below,
    // giving the renderer immediate positions before the first tick lands.
    this.send({
      t: "init",
      count: this.idList.length,
      links,
      width: this.options.width,
      height: this.options.height,
      seedX: seeds.x,
      seedY: seeds.y,
    });

    this.lastX = seeds.x.slice();
    this.lastY = seeds.y.slice();
    this.options.onPositions(this.lastX, this.lastY, 1, this.idList);
  }

  pinNode(id: NodeId, worldX: number, worldY: number): void {
    const index = this.idToIndex.get(id);
    if (index !== undefined) this.send({ t: "pin", index, x: worldX, y: worldY });
  }

  unpinNode(id: NodeId): void {
    const index = this.idToIndex.get(id);
    if (index !== undefined) this.send({ t: "unpin", index });
  }

  reheat(alpha: number = DEFAULT_REHEAT): void {
    this.send({ t: "reheat", alpha });
  }

  indexOf(id: NodeId): number | undefined {
    return this.idToIndex.get(id);
  }

  dispose(): void {
    this.send({ t: "stop" });
    this.worker?.terminate();
    this.fallback?.dispose();
  }

  private onOutbound(message: LayoutOutbound): void {
    if (message.t === "positions") {
      this.lastX = message.x;
      this.lastY = message.y;
      this.options.onPositions(message.x, message.y, message.alpha, this.idList);
    } else {
      this.options.onSettled?.();
    }
  }

  private snapshotPositions(): Map<NodeId, { x: number; y: number }> {
    const snapshot = new Map<NodeId, { x: number; y: number }>();
    if (!this.lastX || !this.lastY) return snapshot;
    for (let i = 0; i < this.idList.length; i += 1) {
      snapshot.set(this.idList[i], { x: this.lastX[i], y: this.lastY[i] });
    }
    return snapshot;
  }

  private send(message: LayoutInbound): void {
    if (this.worker) this.worker.postMessage(message);
    else this.fallback?.handle(message);
  }
}

function createWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}
