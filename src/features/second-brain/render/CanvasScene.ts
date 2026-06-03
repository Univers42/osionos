/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasScene.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { EdgeKind, GraphModel, NodeId } from "../model/graphModel";
import {
  type Camera,
  type WorldBounds,
  IDENTITY,
  fitBounds,
  panBy,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
} from "./camera";
import { type SceneTheme, edgeStroke, nodeFill } from "./theme";

/**
 * Imperative Canvas2D renderer (doc 04 §4). React never participates in the
 * draw loop: positions arrive as flat arrays, the scene draws only when dirty,
 * batches by color/kind, culls to the viewport, and gates labels by LOD. Idle
 * is free — the rAF loop stops when nothing changed and resumes on interaction.
 *
 * Hit-testing & culling are brute-force here (≈0.2 ms at 10k); because node
 * positions change every layout tick a spatial index would need rebuilding each
 * frame, so it is reserved for the >10k upgrade (doc 04 §5).
 */

export interface SceneCallbacks {
  onSelect: (id: NodeId | null) => void;
  onHover: (id: NodeId | null) => void;
  onNodeDragStart: (id: NodeId) => void;
  onNodeDrag: (id: NodeId, worldX: number, worldY: number) => void;
  onNodeDragEnd: (id: NodeId) => void;
  /** Double-click a node — used to expand its neighborhood (BaaS mode). */
  onExpand?: (id: NodeId) => void;
}

const CLICK_DRAG_THRESHOLD = 5;
const LABEL_MIN_SCALE = 1.05;
const TAG_EDGE_MIN_SCALE = 0.45;
const LABEL_BUDGET = 220;

type EdgeBucket = "relation" | "tag" | "note" | "hierarchy";

export class CanvasScene {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private camera: Camera = { ...IDENTITY };

  // Static per-node attributes (index order == model.nodes order).
  private ids: NodeId[] = [];
  private radius = new Float32Array(0);
  private fills: string[] = [];
  private hasNote: Uint8Array = new Uint8Array(0);
  private idToIndex = new Map<NodeId, number>();
  private colorBuckets = new Map<string, number[]>();

  // Per-node database + computed visibility (legend filters).
  private dbId: (string | null)[] = [];
  private visible: Uint8Array = new Uint8Array(0);
  private hiddenDb = new Set<string>();

  // Edge endpoints (node indices) + render buckets.
  private edgeFrom = new Uint32Array(0);
  private edgeTo = new Uint32Array(0);
  private edgeBuckets: Record<EdgeBucket, number[]> = { relation: [], tag: [], note: [], hierarchy: [] };

  // Live positions (from the layout controller).
  private posX = new Float32Array(0);
  private posY = new Float32Array(0);

  private selectedIndex = -1;
  private hoverIndex = -1;
  private focusIndices: Set<number> | null = null;

  private rafId: number | null = null;
  private dirty = true;

  // Interaction state.
  private panning = false;
  private dragIndex = -1;
  private pointerStart = { x: 0, y: 0 };
  private pointerMoved = false;

  private readonly onWheel = (event: WheelEvent) => this.handleWheel(event);
  private readonly onPointerDown = (event: PointerEvent) => this.handlePointerDown(event);
  private readonly onPointerMove = (event: PointerEvent) => this.handlePointerMove(event);
  private readonly onPointerUp = (event: PointerEvent) => this.handlePointerUp(event);
  private readonly onDoubleClick = (event: MouseEvent) => this.handleDoubleClick(event);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private theme: SceneTheme,
    private readonly callbacks: SceneCallbacks,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[second-brain] 2D canvas context unavailable");
    this.ctx = ctx;
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("dblclick", this.onDoubleClick);
    globalThis.addEventListener("pointerup", this.onPointerUp);
    this.requestDraw();
  }

  setSize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.requestDraw();
  }

  setGraph(model: GraphModel): void {
    const count = model.nodes.length;
    this.ids = new Array<NodeId>(count);
    this.radius = new Float32Array(count);
    this.fills = new Array<string>(count);
    this.hasNote = new Uint8Array(count);
    this.idToIndex = new Map();
    this.colorBuckets = new Map();
    this.dbId = new Array<string | null>(count);

    for (let i = 0; i < count; i += 1) {
      const node = model.nodes[i];
      this.ids[i] = node.id;
      this.idToIndex.set(node.id, i);
      this.radius[i] = 4 + node.weight * 15;
      const color = nodeFill(node);
      this.fills[i] = color;
      this.hasNote[i] = node.hasNote ? 1 : 0;
      this.dbId[i] = node.databaseId;
      const bucket = this.colorBuckets.get(color);
      if (bucket) bucket.push(i);
      else this.colorBuckets.set(color, [i]);
    }

    const edges = model.edges;
    this.edgeFrom = new Uint32Array(edges.length);
    this.edgeTo = new Uint32Array(edges.length);
    this.edgeBuckets = { relation: [], tag: [], note: [], hierarchy: [] };
    for (let e = 0; e < edges.length; e += 1) {
      const from = this.idToIndex.get(edges[e].source);
      const to = this.idToIndex.get(edges[e].target);
      if (from === undefined || to === undefined) continue;
      this.edgeFrom[e] = from;
      this.edgeTo[e] = to;
      this.edgeBuckets[bucketOf(edges[e].kind)].push(e);
    }

    if (this.posX.length !== count) {
      this.posX = new Float32Array(count);
      this.posY = new Float32Array(count);
    }
    this.recomputeVisibility();
    this.selectedIndex = -1;
    this.hoverIndex = -1;
    this.focusIndices = null;
    this.requestDraw();
  }

  /** Hide/show whole databases (legend filters). */
  setHiddenDatabases(hidden: ReadonlySet<string>): void {
    this.hiddenDb = new Set(hidden);
    this.recomputeVisibility();
    this.requestDraw();
  }

  private recomputeVisibility(): void {
    const count = this.ids.length;
    if (this.visible.length !== count) this.visible = new Uint8Array(count);
    for (let i = 0; i < count; i += 1) {
      const db = this.dbId[i];
      this.visible[i] = db == null || !this.hiddenDb.has(db) ? 1 : 0;
    }
  }

  setPositions(x: Float32Array, y: Float32Array): void {
    if (x.length !== this.ids.length) return; // stale frame for an old graph
    this.posX = x;
    this.posY = y;
    this.requestDraw();
  }

  setSelected(id: NodeId | null): void {
    this.selectedIndex = id == null ? -1 : this.idToIndex.get(id) ?? -1;
    this.requestDraw();
  }

  /** Highlight a focus neighborhood (dim everything else); null clears it. */
  setFocus(nodeIds: ReadonlySet<NodeId> | null): void {
    if (!nodeIds) {
      this.focusIndices = null;
    } else {
      const set = new Set<number>();
      for (const id of nodeIds) {
        const index = this.idToIndex.get(id);
        if (index !== undefined) set.add(index);
      }
      this.focusIndices = set;
    }
    this.requestDraw();
  }

  setTheme(theme: SceneTheme): void {
    this.theme = theme;
    this.requestDraw();
  }

  getCamera(): Camera {
    return this.camera;
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
    this.requestDraw();
  }

  zoomBy(factor: number): void {
    this.camera = zoomAt(this.camera, this.width / 2, this.height / 2, factor);
    this.requestDraw();
  }

  resetView(): void {
    this.camera = { ...IDENTITY };
    this.requestDraw();
  }

  /** Frame all nodes (or center, if empty) within the viewport. */
  fit(): void {
    if (this.ids.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.ids.length; i += 1) {
      minX = Math.min(minX, this.posX[i]);
      minY = Math.min(minY, this.posY[i]);
      maxX = Math.max(maxX, this.posX[i]);
      maxY = Math.max(maxY, this.posY[i]);
    }
    this.camera = fitBounds({ minX, minY, maxX, maxY }, this.width, this.height);
    this.requestDraw();
  }

  /** Center the camera on a node, keeping the current zoom. */
  focusOn(id: NodeId): void {
    const index = this.idToIndex.get(id);
    if (index === undefined) return;
    this.centerOnWorld(this.posX[index], this.posY[index]);
  }

  /** Center the camera on an arbitrary world point (used by the minimap). */
  centerOnWorld(worldX: number, worldY: number): void {
    const screen = worldToScreen(this.camera, worldX, worldY);
    this.camera = panBy(this.camera, this.width / 2 - screen.x, this.height / 2 - screen.y);
    this.requestDraw();
  }

  getViewportSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Live references (no copy) for the minimap overview. */
  getPositionsRef(): { x: Float32Array; y: Float32Array; count: number; visible: Uint8Array } {
    return { x: this.posX, y: this.posY, count: this.ids.length, visible: this.visible };
  }

  /** Bounds over currently-visible nodes, or null when nothing is visible. */
  worldBounds(): WorldBounds | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (let i = 0; i < this.ids.length; i += 1) {
      if (this.visible[i] === 0) continue;
      any = true;
      if (this.posX[i] < minX) minX = this.posX[i];
      if (this.posY[i] < minY) minY = this.posY[i];
      if (this.posX[i] > maxX) maxX = this.posX[i];
      if (this.posY[i] > maxY) maxY = this.posY[i];
    }
    return any ? { minX, minY, maxX, maxY } : null;
  }

  destroy(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    globalThis.removeEventListener("pointerup", this.onPointerUp);
  }

  // ---- draw loop ----------------------------------------------------------

  private requestDraw(): void {
    this.dirty = true;
    if (this.rafId == null) this.rafId = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.rafId = null;
    if (!this.dirty) return;
    this.dirty = false;
    this.render();
    // Re-arm only if something marked us dirty again during render.
    if (this.dirty && this.rafId == null) this.rafId = requestAnimationFrame(() => this.frame());
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(0, 0, this.width, this.height);

    const view = visibleWorldRect(this.camera, this.width, this.height);
    const focus = this.focusIndices;

    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.scale, this.camera.scale);

    if (focus) {
      ctx.globalAlpha = this.theme.dimAlpha;
      this.drawEdges(view);
      this.drawNodes(view);
      ctx.globalAlpha = 1;
      this.drawFocusOverlay(view, focus);
    } else {
      this.drawEdges(view);
      this.drawNodes(view);
    }
    this.drawRings();
    ctx.restore();

    this.drawLabels(view, focus);
  }

  private drawEdges(view: ReturnType<typeof visibleWorldRect>): void {
    const ctx = this.ctx;
    const showTags = this.camera.scale >= TAG_EDGE_MIN_SCALE;
    (Object.keys(this.edgeBuckets) as EdgeBucket[]).forEach((bucket) => {
      if (bucket === "tag" && !showTags) return;
      const indices = this.edgeBuckets[bucket];
      if (indices.length === 0) return;
      ctx.strokeStyle = edgeStroke(this.theme, edgeKindForBucket(bucket));
      ctx.lineWidth = edgeWidth(bucket) / this.camera.scale;
      ctx.beginPath();
      for (const e of indices) {
        const a = this.edgeFrom[e];
        const b = this.edgeTo[e];
        if (this.visible[a] === 0 || this.visible[b] === 0) continue;
        if (!this.segmentVisible(a, b, view)) continue;
        ctx.moveTo(this.posX[a], this.posY[a]);
        ctx.lineTo(this.posX[b], this.posY[b]);
      }
      ctx.stroke();
    });
  }

  private drawNodes(view: ReturnType<typeof visibleWorldRect>): void {
    const ctx = this.ctx;
    for (const [color, indices] of this.colorBuckets) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const i of indices) {
        if (!this.nodeVisible(i, view)) continue;
        const r = this.radius[i];
        ctx.moveTo(this.posX[i] + r, this.posY[i]);
        ctx.arc(this.posX[i], this.posY[i], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  private drawFocusOverlay(view: ReturnType<typeof visibleWorldRect>, focus: Set<number>): void {
    const ctx = this.ctx;
    // Focused edges (both endpoints in focus) at full strength.
    ctx.strokeStyle = this.theme.edge;
    ctx.lineWidth = 1.3 / this.camera.scale;
    ctx.beginPath();
    for (let e = 0; e < this.edgeFrom.length; e += 1) {
      const a = this.edgeFrom[e];
      const b = this.edgeTo[e];
      if (!focus.has(a) || !focus.has(b)) continue;
      if (this.visible[a] === 0 || this.visible[b] === 0) continue;
      ctx.moveTo(this.posX[a], this.posY[a]);
      ctx.lineTo(this.posX[b], this.posY[b]);
    }
    ctx.stroke();
    // Focused nodes at full color.
    for (const i of focus) {
      if (!this.nodeVisible(i, view)) continue;
      const r = this.radius[i];
      ctx.fillStyle = this.fills[i];
      ctx.beginPath();
      ctx.arc(this.posX[i], this.posY[i], r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRings(): void {
    const ctx = this.ctx;
    // Note rings.
    ctx.strokeStyle = this.theme.noteRing;
    ctx.lineWidth = 1.5 / this.camera.scale;
    for (let i = 0; i < this.ids.length; i += 1) {
      if (!this.hasNote[i] || this.visible[i] === 0) continue;
      ctx.beginPath();
      ctx.arc(this.posX[i], this.posY[i], this.radius[i] + 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.drawAccentRing(this.hoverIndex, this.theme.hoverRing, 2);
    this.drawAccentRing(this.selectedIndex, this.theme.selectRing, 2.5);
  }

  private drawAccentRing(index: number, color: string, width: number): void {
    if (index < 0 || this.visible[index] === 0) return;
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width / this.camera.scale;
    ctx.beginPath();
    ctx.arc(this.posX[index], this.posY[index], this.radius[index] + 3.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawLabels(view: ReturnType<typeof visibleWorldRect>, focus: Set<number> | null): void {
    const ctx = this.ctx;
    const showAll = this.camera.scale >= LABEL_MIN_SCALE;
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    let budget = LABEL_BUDGET;

    for (let i = 0; i < this.ids.length; i += 1) {
      if (!this.nodeVisible(i, view)) continue;
      const isAccent = i === this.selectedIndex || i === this.hoverIndex || (focus?.has(i) ?? false);
      if (!isAccent) {
        if (!showAll || budget <= 0) continue;
        budget -= 1;
      }
      this.drawLabel(this.labelText[i] ?? this.ids[i], i);
    }
  }

  private drawLabel(text: string, index: number): void {
    const ctx = this.ctx;
    const screen = worldToScreen(this.camera, this.posX[index], this.posY[index]);
    const x = screen.x + this.radius[index] * this.camera.scale + 4;
    ctx.fillStyle = this.theme.labelHalo;
    const width = ctx.measureText(text).width;
    ctx.fillRect(x - 2, screen.y - 8, width + 4, 16);
    ctx.fillStyle = this.theme.label;
    ctx.fillText(text, x, screen.y);
  }

  // ---- visibility helpers -------------------------------------------------

  private labelText: string[] = [];

  private nodeVisible(i: number, view: ReturnType<typeof visibleWorldRect>): boolean {
    if (this.visible[i] === 0) return false;
    const r = this.radius[i];
    return (
      this.posX[i] + r >= view.minX &&
      this.posX[i] - r <= view.maxX &&
      this.posY[i] + r >= view.minY &&
      this.posY[i] - r <= view.maxY
    );
  }

  private segmentVisible(a: number, b: number, view: ReturnType<typeof visibleWorldRect>): boolean {
    const minX = Math.min(this.posX[a], this.posX[b]);
    const maxX = Math.max(this.posX[a], this.posX[b]);
    const minY = Math.min(this.posY[a], this.posY[b]);
    const maxY = Math.max(this.posY[a], this.posY[b]);
    return maxX >= view.minX && minX <= view.maxX && maxY >= view.minY && minY <= view.maxY;
  }

  // ---- interaction --------------------------------------------------------

  private hitTest(screenX: number, screenY: number): number {
    const world = screenToWorld(this.camera, screenX, screenY);
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.ids.length; i += 1) {
      if (this.visible[i] === 0) continue;
      const dx = this.posX[i] - world.x;
      const dy = this.posY[i] - world.y;
      const reach = this.radius[i] + 4;
      const dist = dx * dx + dy * dy;
      if (dist <= reach * reach && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    return best;
  }

  private localPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private handlePointerDown(event: PointerEvent): void {
    const point = this.localPoint(event);
    this.pointerStart = point;
    this.pointerMoved = false;
    this.canvas.setPointerCapture(event.pointerId);

    const hit = this.hitTest(point.x, point.y);
    if (hit >= 0) {
      this.dragIndex = hit;
      this.callbacks.onNodeDragStart(this.ids[hit]);
    } else {
      this.panning = true;
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    const point = this.localPoint(event);
    const dx = point.x - this.pointerStart.x;
    const dy = point.y - this.pointerStart.y;
    if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) this.pointerMoved = true;

    if (this.dragIndex >= 0) {
      const world = screenToWorld(this.camera, point.x, point.y);
      this.posX[this.dragIndex] = world.x;
      this.posY[this.dragIndex] = world.y;
      this.callbacks.onNodeDrag(this.ids[this.dragIndex], world.x, world.y);
      this.requestDraw();
      return;
    }
    if (this.panning) {
      this.camera = panBy(this.camera, event.movementX, event.movementY);
      this.requestDraw();
      return;
    }
    const hit = this.hitTest(point.x, point.y);
    if (hit !== this.hoverIndex) {
      this.hoverIndex = hit;
      this.callbacks.onHover(hit >= 0 ? this.ids[hit] : null);
      this.canvas.style.cursor = hit >= 0 ? "pointer" : "default";
      this.requestDraw();
    }
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.dragIndex >= 0) {
      const id = this.ids[this.dragIndex];
      this.callbacks.onNodeDragEnd(id);
      if (!this.pointerMoved) this.callbacks.onSelect(id);
      this.dragIndex = -1;
    } else if (this.panning && !this.pointerMoved) {
      this.callbacks.onSelect(null);
    }
    this.panning = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const point = this.localPoint(event);
    this.camera = zoomAt(this.camera, point.x, point.y, event.deltaY < 0 ? 1.12 : 0.89);
    this.requestDraw();
  }

  private handleDoubleClick(event: MouseEvent): void {
    const point = this.localPoint(event);
    const hit = this.hitTest(point.x, point.y);
    if (hit >= 0) this.callbacks.onExpand?.(this.ids[hit]);
  }

  /** Set per-node label text (called by the view alongside setGraph). */
  setLabels(labels: string[]): void {
    this.labelText = labels;
    this.requestDraw();
  }
}

function bucketOf(kind: EdgeKind): EdgeBucket {
  if (kind === "tag") return "tag";
  if (kind === "hierarchy") return "hierarchy";
  if (kind === "note_of" || kind === "note_link") return "note";
  return "relation";
}

function edgeKindForBucket(bucket: EdgeBucket): EdgeKind {
  if (bucket === "tag") return "tag";
  if (bucket === "hierarchy") return "hierarchy";
  if (bucket === "note") return "note_link";
  return "relation";
}

/** Stroke width (world units) per bucket — hierarchy reads as the bold tree spine. */
function edgeWidth(bucket: EdgeBucket): number {
  if (bucket === "hierarchy") return 2.2;
  if (bucket === "relation") return 1.1;
  return 0.8;
}
