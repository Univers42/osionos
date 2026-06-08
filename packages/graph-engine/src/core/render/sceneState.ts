/**
 * Columnar scene state: flat typed-array buffers (index order == model.nodes
 * order) that the imperative renderer reads every frame. Built once per graph,
 * mutated cheaply for positions/visibility. No drawing here — pure data so it is
 * unit-testable without a canvas.
 */

import type { EdgeKind, GraphModel, NodeId, NodeKind } from "../types";
import type { WorldBounds } from "../camera/transform";
import type { FilterState } from "../state/controls";
import { nodeFill } from "../theme/colors";
import { weightToRadius } from "../model/weights";
import { shapeOf, styleKey } from "./nodeShape";
import { TIERS, strengthTier } from "./tiers";

export const MIN_RADIUS = 5;
export const MAX_RADIUS = 22;
/** relation=0, tag=1, note=2, hierarchy=3 */
export type EdgeBucketId = 0 | 1 | 2 | 3;

export class SceneState {
  count = 0;
  ids: NodeId[] = [];
  idToIndex = new Map<NodeId, number>();
  radius = new Float32Array(0);
  fills: string[] = [];
  kind: NodeKind[] = [];
  label: string[] = [];
  databaseId: (string | null)[] = [];
  source: string[] = [];
  hasNote = new Uint8Array(0);
  /** Node indices grouped by `shape|color` so each sprite is blitted in one batch. */
  styleBuckets = new Map<string, number[]>();

  edgeFrom = new Uint32Array(0);
  edgeTo = new Uint32Array(0);
  edgeBucket = new Uint8Array(0);
  edgeStrength = new Float32Array(0);
  edgeDirected = new Uint8Array(0);
  /** Edge indices grouped by bucket×tier (length 4*TIERS) for batched strokes. */
  edgeGroups: number[][] = [];

  posX = new Float32Array(0);
  posY = new Float32Array(0);
  visible = new Uint8Array(0);
  labelText: string[] = [];

  private tagColors: Map<string, string> = new Map();

  setGraph(model: GraphModel, tagColors?: Map<string, string>): void {
    this.tagColors = tagColors ?? new Map();
    const count = model.nodes.length;
    this.count = count;
    this.ids = new Array<NodeId>(count);
    this.idToIndex = new Map();
    this.radius = new Float32Array(count);
    this.kind = new Array<NodeKind>(count);
    this.label = new Array<string>(count);
    this.databaseId = new Array<string | null>(count);
    this.source = new Array<string>(count);
    this.hasNote = new Uint8Array(count);
    this.labelText = new Array<string>(count);

    for (let i = 0; i < count; i += 1) {
      const node = model.nodes[i];
      this.ids[i] = node.id;
      this.idToIndex.set(node.id, i);
      this.radius[i] = weightToRadius(node.weight, MIN_RADIUS, MAX_RADIUS);
      this.kind[i] = node.kind;
      this.label[i] = node.label;
      this.labelText[i] = node.label;
      this.databaseId[i] = node.databaseId;
      this.source[i] = node.source;
      this.hasNote[i] = node.hasNote ? 1 : 0;
    }
    this.recolor(this.tagColors);
    this.buildEdges(model);

    if (this.posX.length !== count) {
      this.posX = new Float32Array(count);
      this.posY = new Float32Array(count);
    }
    if (this.visible.length !== count) this.visible = new Uint8Array(count).fill(1);
    else this.visible.fill(1);
  }

  /** Recompute fills + color batches (called when tag colors change). */
  recolor(tagColors: Map<string, string>): void {
    this.tagColors = tagColors;
    this.fills = new Array<string>(this.count);
    this.styleBuckets = new Map();
    for (let i = 0; i < this.count; i += 1) {
      const color = nodeFill(
        {
          kind: this.kind[i],
          label: this.label[i],
          databaseId: this.databaseId[i],
          source: this.source[i],
        },
        tagColors,
      );
      this.fills[i] = color;
      const key = styleKey(shapeOf(this.kind[i]), color);
      const bucket = this.styleBuckets.get(key);
      if (bucket) bucket.push(i);
      else this.styleBuckets.set(key, [i]);
    }
  }

  setPositions(x: Float32Array, y: Float32Array): boolean {
    if (x.length !== this.count) return false; // stale frame for an old graph
    this.posX = x;
    this.posY = y;
    return true;
  }

  setLabels(labels: string[]): void {
    if (labels.length === this.count) this.labelText = labels;
  }

  /** Compute per-node visibility from the console filters. */
  applyFilters(filter: FilterState): void {
    const dbs = new Set(filter.hiddenDatabases);
    const kinds = new Set(filter.hiddenKinds);
    const tags = new Set(filter.hiddenTags);
    for (let i = 0; i < this.count; i += 1) {
      const db = this.databaseId[i];
      const hidden =
        kinds.has(this.kind[i]) ||
        (db != null && dbs.has(db)) ||
        (this.kind[i] === "tag" && tags.has(this.label[i]));
      this.visible[i] = hidden ? 0 : 1;
    }
  }

  worldBounds(): WorldBounds | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (let i = 0; i < this.count; i += 1) {
      if (this.visible[i] === 0) continue;
      any = true;
      if (this.posX[i] < minX) minX = this.posX[i];
      if (this.posY[i] < minY) minY = this.posY[i];
      if (this.posX[i] > maxX) maxX = this.posX[i];
      if (this.posY[i] > maxY) maxY = this.posY[i];
    }
    return any ? { minX, minY, maxX, maxY } : null;
  }

  private buildEdges(model: GraphModel): void {
    const edges = model.edges;
    this.edgeFrom = new Uint32Array(edges.length);
    this.edgeTo = new Uint32Array(edges.length);
    this.edgeBucket = new Uint8Array(edges.length);
    this.edgeStrength = new Float32Array(edges.length);
    this.edgeDirected = new Uint8Array(edges.length);
    this.edgeGroups = Array.from({ length: 4 * TIERS }, () => []);
    for (let e = 0; e < edges.length; e += 1) {
      const from = this.idToIndex.get(edges[e].source);
      const to = this.idToIndex.get(edges[e].target);
      if (from === undefined || to === undefined) continue;
      const bucket = bucketOf(edges[e].kind);
      this.edgeFrom[e] = from;
      this.edgeTo[e] = to;
      this.edgeBucket[e] = bucket;
      this.edgeStrength[e] = edges[e].strength;
      this.edgeDirected[e] = edges[e].directed ? 1 : 0;
      this.edgeGroups[bucket * TIERS + strengthTier(edges[e].strength)].push(e);
    }
  }
}

export function bucketOf(kind: EdgeKind): EdgeBucketId {
  if (kind === "tag") return 1;
  if (kind === "note_of" || kind === "note_link") return 2;
  if (kind === "hierarchy") return 3;
  return 0;
}
