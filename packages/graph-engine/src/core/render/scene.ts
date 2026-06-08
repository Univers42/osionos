/**
 * Imperative Canvas2D scene orchestrator. React never participates in the draw
 * loop: positions arrive as flat arrays, the scene redraws only when dirty (or
 * while revealing), and delegates the actual drawing to `renderFrame`. Owns the
 * columnar SceneState, the glassy sprite cache, the camera, and interaction.
 */

import { type Camera, IDENTITY, screenToWorld, worldToScreen } from "../camera/transform";
import type { WorldBounds } from "../camera/transform";
import { fitBounds, panBy, zoomAt } from "../camera/controls";
import type { GraphModel, NodeId } from "../types";
import { type Controls, DEFAULT_CONTROLS, type VisualState } from "../state/controls";
import type { SceneTheme } from "../theme/tokens";
import { SceneState } from "./sceneState";
import { NodeSpriteCache } from "./sprites";
import { hitTest } from "./cull";
import { type RevealState, isRevealing, startReveal } from "./reveal";
import { renderFrame } from "./renderFrame";
import { sceneToSvg } from "./exportSvg";
import { type InteractionHost, type SceneCallbacks, SceneInteraction } from "./interaction";

export class CanvasScene implements InteractionHost {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly state = new SceneState();
  private readonly sprites = new NodeSpriteCache();
  private readonly interaction: SceneInteraction;

  private width = 0;
  private height = 0;
  private dpr = 1;
  private camera: Camera = { ...IDENTITY };
  private visual: VisualState = { ...DEFAULT_CONTROLS.visual };
  private tagColors = new Map<string, string>();
  private tagColorSig = "";

  private reveal: RevealState = startReveal(false, 0, 0);
  private hasRevealed = false;
  private focusIndices: Set<number> | null = null;
  private focusNodeIds: ReadonlySet<NodeId> | null = null;
  private hoverIndex = -1;
  private selectedIndex = -1;
  private selectedId: NodeId | null = null;
  private model: GraphModel | null = null;

  private rafId: number | null = null;
  private dirty = true;

  constructor(
    canvas: HTMLCanvasElement,
    private theme: SceneTheme,
    callbacks: SceneCallbacks,
    private readonly reducedMotion: boolean,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[graph-engine] 2D canvas context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.sprites.setTheme(theme.nodeBacking);
    this.interaction = new SceneInteraction(this, callbacks);
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
    this.model = model;
    this.state.setGraph(model, this.tagColors);
    this.hoverIndex = -1;
    this.recomputeIndices(); // keep selection/focus stable across edits & rebuilds
    const firstPopulate = !this.hasRevealed && model.nodes.length > 0;
    this.reveal = startReveal(firstPopulate && !this.reducedMotion, model.nodes.length, performance.now());
    if (firstPopulate) this.hasRevealed = true;
    this.requestDraw();
  }

  setPositions(x: Float32Array, y: Float32Array): void {
    if (this.state.setPositions(x, y)) this.requestDraw();
  }

  setLabels(labels: string[]): void {
    this.state.setLabels(labels);
    this.requestDraw();
  }

  setTheme(theme: SceneTheme): void {
    this.theme = theme;
    this.sprites.setTheme(theme.nodeBacking);
    this.requestDraw();
  }

  /** Apply console filters + visual settings (physics is handled by the engine). */
  setControls(controls: Controls): void {
    this.visual = controls.visual;
    const sig = JSON.stringify(controls.filter.tagColors);
    if (sig !== this.tagColorSig) {
      this.tagColorSig = sig;
      this.tagColors = tagColorMap(controls.filter.tagColors);
      this.state.recolor(this.tagColors);
    }
    this.state.applyFilters(controls.filter);
    this.requestDraw();
  }

  setSelected(id: NodeId | null): void {
    this.selectedId = id;
    this.selectedIndex = id == null ? -1 : this.state.idToIndex.get(id) ?? -1;
    this.requestDraw();
  }

  setFocus(ids: ReadonlySet<NodeId> | null): void {
    this.focusNodeIds = ids;
    this.recomputeFocus();
    this.requestDraw();
  }

  private recomputeIndices(): void {
    this.selectedIndex = this.selectedId == null ? -1 : this.state.idToIndex.get(this.selectedId) ?? -1;
    this.recomputeFocus();
  }

  private recomputeFocus(): void {
    if (!this.focusNodeIds) {
      this.focusIndices = null;
      return;
    }
    const set = new Set<number>();
    for (const id of this.focusNodeIds) {
      const index = this.state.idToIndex.get(id);
      if (index !== undefined) set.add(index);
    }
    this.focusIndices = set;
  }

  // ---- camera --------------------------------------------------------------

  getCamera(): Camera { return this.camera; }

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

  fit(): void {
    const bounds = this.state.worldBounds();
    if (bounds) this.camera = fitBounds(bounds, this.width, this.height);
    this.requestDraw();
  }

  focusOn(id: NodeId): void {
    const index = this.state.idToIndex.get(id);
    if (index === undefined) return;
    const screen = worldToScreen(this.camera, this.state.posX[index], this.state.posY[index]);
    this.camera = panBy(this.camera, this.width / 2 - screen.x, this.height / 2 - screen.y);
    this.requestDraw();
  }

  // ---- accessors / InteractionHost -----------------------------------------

  getModel(): GraphModel | null { return this.model; }

  exportSvg(): string {
    return sceneToSvg(this.state, this.theme, this.visual);
  }

  getViewportSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Live position buffers (no copy) for the minimap overview. */
  getPositionsRef(): { x: Float32Array; y: Float32Array; count: number; visible: Uint8Array } {
    return { x: this.state.posX, y: this.state.posY, count: this.state.count, visible: this.state.visible };
  }

  /** Center the camera on a world point (used by the minimap). */
  centerOnWorld(worldX: number, worldY: number): void {
    const screen = worldToScreen(this.camera, worldX, worldY);
    this.camera = panBy(this.camera, this.width / 2 - screen.x, this.height / 2 - screen.y);
    this.requestDraw();
  }

  worldBounds(): WorldBounds | null {
    return this.state.worldBounds();
  }

  hitTestLocal(x: number, y: number): number {
    const world = screenToWorld(this.camera, x, y);
    return hitTest(this.state, world.x, world.y, this.visual.nodeScale);
  }

  idAt(index: number): NodeId {
    return this.state.ids[index];
  }

  setNodePosition(index: number, worldX: number, worldY: number): void {
    this.state.posX[index] = worldX;
    this.state.posY[index] = worldY;
    this.requestDraw();
  }

  setHover(index: number): void {
    if (index === this.hoverIndex) return;
    this.hoverIndex = index;
    this.canvas.style.cursor = index >= 0 ? "pointer" : "default";
    this.requestDraw();
  }

  destroy(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.interaction.destroy();
  }

  private requestDraw(): void {
    this.dirty = true;
    if (this.rafId == null) this.rafId = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.rafId = null;
    const now = performance.now();
    if (!this.dirty && !isRevealing(this.reveal, now)) return;
    this.dirty = false;
    renderFrame({
      ctx: this.ctx,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      camera: this.camera,
      theme: this.theme,
      visual: this.visual,
      state: this.state,
      sprites: this.sprites,
      reveal: this.reveal,
      time: now,
      focus: this.focusIndices,
      hoverIndex: this.hoverIndex,
      selectedIndex: this.selectedIndex,
      reducedMotion: this.reducedMotion,
    });
    if (this.dirty || isRevealing(this.reveal, now)) {
      this.rafId = requestAnimationFrame(() => this.frame());
    }
  }
}

function tagColorMap(record: Record<string, string> | undefined): Map<string, string> {
  return new Map(Object.entries(record ?? {}));
}
