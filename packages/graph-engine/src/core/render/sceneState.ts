/**
 * Columnar scene state: flat typed-array buffers (index order == model.nodes
 * order) that the imperative renderer reads every frame. Built once per graph,
 * mutated cheaply for positions/visibility. No drawing here — pure data so it is
 * unit-testable without a canvas. Edge-side state lives in SceneEdges; its
 * arrays are aliased onto this class so render passes keep flat field access.
 */

import type { GraphModel, NodeId, NodeKind } from "../types";
import type { WorldBounds } from "../camera/transform";
import type { FilterState } from "../state/controls";
import { nodeFill } from "../theme/colors";
import { weightToRadius } from "../model/weights";
import { glyphKey, iconGlyph } from "./nodeIcon";
import { shapeOf, styleKey } from "./nodeShape";
import { SceneEdges } from "./sceneEdges";
import { SpatialGrid } from "./spatialGrid";

export { bucketOf, type EdgeBucketId } from "./sceneEdges";

export const MIN_RADIUS = 5;
export const MAX_RADIUS = 22;

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
  /** Raw IconValue string per node (null = monogram fallback). */
  icon: (string | null)[] = [];
  /** Node indices grouped by `shape|color|glyph` so each sprite is blitted in one batch. */
  styleBuckets = new Map<string, number[]>();

  edges = new SceneEdges();
  edgeFrom = this.edges.edgeFrom;
  edgeTo = this.edges.edgeTo;
  edgeBucket = this.edges.edgeBucket;
  edgeStrength = this.edges.edgeStrength;
  edgeDirected = this.edges.edgeDirected;
  edgeGroups = this.edges.edgeGroups;
  degree = this.edges.degree;
  isHub = this.edges.isHub;

  posX = new Float32Array(0);
  posY = new Float32Array(0);
  visible = new Uint8Array(0);
  labelText: string[] = [];
  grid = new SpatialGrid();

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
    this.icon = new Array<string | null>(count);
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
      this.icon[i] = node.icon ?? null;
    }
    this.recolor(this.tagColors);
    this.edges.build(model, this.idToIndex, count);
    this.aliasEdges();

    if (this.posX.length !== count) {
      this.posX = new Float32Array(count);
      this.posY = new Float32Array(count);
    }
    if (this.visible.length !== count) this.visible = new Uint8Array(count).fill(1);
    else this.visible.fill(1);
    this.grid.markStale();
  }

  /** Re-point the flat aliases at the freshly built edge buffers. */
  private aliasEdges(): void {
    this.edgeFrom = this.edges.edgeFrom;
    this.edgeTo = this.edges.edgeTo;
    this.edgeBucket = this.edges.edgeBucket;
    this.edgeStrength = this.edges.edgeStrength;
    this.edgeDirected = this.edges.edgeDirected;
    this.edgeGroups = this.edges.edgeGroups;
    this.degree = this.edges.degree;
    this.isHub = this.edges.isHub;
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
      const glyph = glyphKey(iconGlyph(this.icon[i] ?? null, this.label[i]));
      const key = styleKey(shapeOf(this.kind[i]), color, glyph);
      const bucket = this.styleBuckets.get(key);
      if (bucket) bucket.push(i);
      else this.styleBuckets.set(key, [i]);
    }
  }

  setPositions(x: Float32Array, y: Float32Array): boolean {
    if (x.length !== this.count) return false; // stale frame for an old graph
    this.posX = x;
    this.posY = y;
    this.grid.markStale();
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
}
