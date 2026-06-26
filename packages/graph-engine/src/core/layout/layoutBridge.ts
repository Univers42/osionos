/**
 * Main-thread side of the layout split. Owns the stable nodeId↔index mapping,
 * builds the link list from a `GraphModel`, and preserves positions across
 * rebuilds (so editing keeps the graph from teleporting). Runs the worker when
 * available and transparently falls back to an in-process `LayoutEngine`
 * (tests / no-Worker environments) — the API is identical.
 */

import type { GraphModel, NodeId } from "../types";
import { type LayoutLink, clusterCenters, GOLDEN_ANGLE, seedPositions } from "./forceLayout";
import { type LayoutInbound, LayoutEngine, type LayoutOutbound } from "./layoutEngine";
import { type LayoutParams, DEFAULT_LAYOUT_PARAMS } from "./params";

export interface LayoutControllerOptions {
  width: number;
  height: number;
  params?: LayoutParams;
  onPositions: (x: Float32Array, y: Float32Array, alpha: number, idList: readonly NodeId[]) => void;
  onSettled?: () => void;
}

const DEFAULT_REHEAT = 0.35;

export class LayoutController {
  private readonly worker: Worker | null;
  private readonly fallback: LayoutEngine | null;
  private params: LayoutParams;

  private idList: NodeId[] = [];
  private idToIndex = new Map<NodeId, number>();
  private lastX: Float32Array | null = null;
  private lastY: Float32Array | null = null;

  constructor(private readonly options: LayoutControllerOptions) {
    this.params = options.params ?? DEFAULT_LAYOUT_PARAMS;
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

    const nodeGroups = new Uint8Array(this.idList.length);
    const sourceIndex = new Map<string, number>();
    for (let i = 0; i < model.nodes.length; i += 1) {
      const source = model.nodes[i].source;
      if (source == null) continue;
      let g = sourceIndex.get(source);
      if (g === undefined) {
        g = sourceIndex.size;
        sourceIndex.set(source, g);
      }
      nodeGroups[i] = g & 0xff;
    }
    const groups = sourceIndex.size;
    const centers =
      groups > 1
        ? clusterCenters(this.idList.length, groups, this.options.width, this.options.height)
        : null;
    const localCount = centers ? new Int32Array(groups) : null;

    const seeds = seedPositions(this.idList.length, this.options.width, this.options.height);
    for (let i = 0; i < this.idList.length; i += 1) {
      const previous = snapshot.get(this.idList[i]);
      if (previous) {
        seeds.x[i] = previous.x;
        seeds.y[i] = previous.y;
      } else if (centers && localCount) {
        const c = centers[nodeGroups[i]];
        const li = localCount[nodeGroups[i]];
        localCount[nodeGroups[i]] = li + 1;
        const r = 8 * Math.sqrt(li + 1);
        seeds.x[i] = c.x + Math.cos(li * GOLDEN_ANGLE) * r;
        seeds.y[i] = c.y + Math.sin(li * GOLDEN_ANGLE) * r;
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

    this.send({
      t: "init",
      count: this.idList.length,
      links,
      width: this.options.width,
      height: this.options.height,
      params: this.params,
      seedX: seeds.x,
      seedY: seeds.y,
      nodeGroups,
    });

    this.lastX = seeds.x.slice();
    this.lastY = seeds.y.slice();
    this.options.onPositions(this.lastX, this.lastY, 1, this.idList);
  }

  /** Push new physics params to the live simulation (console Physics panel). */
  setParams(params: LayoutParams): void {
    this.params = params;
    this.send({ t: "params", params });
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

  /** Pause the tick loop (positions hold where they are). Reheat resumes it. */
  freeze(): void {
    this.send({ t: "stop" });
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
