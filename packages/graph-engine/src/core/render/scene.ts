/**
 * Imperative Canvas2D scene orchestrator. React never participates in the draw
 * loop: positions arrive as flat arrays, the scene redraws only when dirty (or
 * while revealing), and delegates the actual drawing to `renderFrame`. Owns the
 * columnar SceneState + sprite cache; camera math lives in SceneCamera and the
 * selection/focus index tracking in SceneSelection, so this stays a thin façade.
 */

import type { Camera, WorldBounds } from "../camera/transform";
import type { GraphModel, NodeId } from "../types";
import { type Controls, DEFAULT_CONTROLS, type VisualState, tagColorMap } from "../state/controls";
import type { SceneTheme } from "../theme/tokens";
import { SceneState } from "./sceneState";
import { SceneCamera } from "./sceneCamera";
import { SceneSelection } from "./sceneSelection";
import { NodeSpriteCache } from "./sprites";
import { LabelCache } from "./labelCache";
import { SceneFx } from "./sceneFx";
import { clearCardTextCache } from "./cardText";
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
  private readonly labels = new LabelCache();
  private readonly fx = new SceneFx();
  private readonly cam = new SceneCamera();
  private readonly sel = new SceneSelection();
  private readonly interaction: SceneInteraction;

  private visual: VisualState = { ...DEFAULT_CONTROLS.visual };
  private tagColors = new Map<string, string>();
  private tagColorSig = "";

  private reveal: RevealState = startReveal(false, 0, 0);
  private hasRevealed = false;
  private hoverIndex = -1;
  private model: GraphModel | null = null;

  private rafId: number | null = null;
  private dirty = true;
  /** While now < motionUntil the scene renders at reduced resolution (user pan / zoom / drag). */
  private motionUntil = 0;
  /** True while the worker streams layout positions; set per position message and
   *  cleared on `settled`. Drives the reduced-resolution settle that ends crisp and
   *  deterministically (on `settled`) — NOT re-armed every tick like user motion. */
  private layoutStreaming = false;

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
    this.sprites.setTheme({
      backing: theme.nodeBacking,
      mode: theme.mode,
      rim: theme.nodeRim,
      shadow: theme.nodeShadow,
    });
    this.sprites.onInvalidate = () => this.requestDraw();
    this.labels.setTheme(theme.label, theme.labelHalo, 1);
    this.interaction = new SceneInteraction(this, callbacks);
    this.requestDraw();
  }

  setSize(width: number, height: number, dpr: number): void {
    this.cam.setViewport(width, height, dpr);
    // Labels are always baked at the crisp resolution; the canvas backing may drop
    // to interactiveDpr during motion, which only softens the (screen-space) blit.
    this.labels.setTheme(this.theme.label, this.theme.labelHalo, this.cam.qualityDpr);
    this.canvas.width = Math.round(width * this.cam.dpr);
    this.canvas.height = Math.round(height * this.cam.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.requestDraw();
  }

  setGraph(model: GraphModel): void {
    this.model = model;
    this.state.setGraph(model, this.tagColors);
    this.hoverIndex = -1;
    this.sel.recompute(this.state.idToIndex); // keep selection/focus stable across rebuilds
    const firstPopulate = !this.hasRevealed && model.nodes.length > 0;
    // The staggered fly-in holds low-DPR for ~820ms and staggers per node — skip it
    // for large graphs where it only adds churn to an already-heavy first settle.
    const revealOk = firstPopulate && !this.reducedMotion && model.nodes.length <= 8000;
    this.reveal = startReveal(revealOk, model.nodes.length, performance.now());
    if (firstPopulate) this.hasRevealed = true;
    this.requestDraw();
  }

  setPositions(x: Float32Array, y: Float32Array): void {
    if (this.state.setPositions(x, y)) {
      this.layoutStreaming = true;
      this.requestDraw();
    }
  }

  /** The worker layout settled — stop streaming and render one final crisp frame. */
  markLayoutSettled(): void {
    this.layoutStreaming = false;
    this.requestDraw();
  }

  setLabels(labels: string[]): void { this.state.setLabels(labels); this.requestDraw(); }

  setTheme(theme: SceneTheme): void {
    this.theme = theme;
    this.sprites.setTheme({
      backing: theme.nodeBacking,
      mode: theme.mode,
      rim: theme.nodeRim,
      shadow: theme.nodeShadow,
    });
    this.labels.setTheme(theme.label, theme.labelHalo, this.cam.qualityDpr);
    clearCardTextCache();
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

  setSelected(id: NodeId | null): void { this.sel.setSelected(id, this.state.idToIndex); this.requestDraw(); }

  setFocus(ids: ReadonlySet<NodeId> | null): void { this.sel.setFocus(ids, this.state.idToIndex); this.requestDraw(); }

  // ---- camera (delegates to SceneCamera) -----------------------------------

  getCamera(): Camera { return this.cam.camera; }

  setCamera(camera: Camera): void { this.cam.camera = camera; this.bumpMotion(); this.requestDraw(); }

  zoomBy(factor: number): void { this.cam.zoomBy(factor); this.bumpMotion(); this.requestDraw(); }

  resetView(): void { this.cam.reset(); this.requestDraw(); }

  fit(): void { this.cam.fit(this.state.worldBounds()); this.requestDraw(); }

  focusOn(id: NodeId): void {
    const index = this.state.idToIndex.get(id);
    if (index === undefined) return;
    this.cam.centerOnWorld(this.state.posX[index], this.state.posY[index]);
    this.requestDraw();
  }

  /** Center the camera on a world point (used by the minimap). */
  centerOnWorld(worldX: number, worldY: number): void { this.cam.centerOnWorld(worldX, worldY); this.requestDraw(); }

  // ---- accessors / InteractionHost -----------------------------------------

  getModel(): GraphModel | null { return this.model; }

  exportSvg(): string { return sceneToSvg(this.state, this.theme, this.visual); }

  getViewportSize(): { width: number; height: number } { return { width: this.cam.width, height: this.cam.height }; }

  /** Live position buffers (no copy) for the minimap overview. */
  getPositionsRef(): { x: Float32Array; y: Float32Array; count: number; visible: Uint8Array } {
    return { x: this.state.posX, y: this.state.posY, count: this.state.count, visible: this.state.visible };
  }

  worldBounds(): WorldBounds | null { return this.state.worldBounds(); }

  hitTestLocal(x: number, y: number): number {
    const world = this.cam.screenToWorld(x, y);
    return hitTest(this.state, world.x, world.y, this.visual.nodeScale);
  }

  idAt(index: number): NodeId { return this.state.ids[index]; }

  setNodePosition(index: number, worldX: number, worldY: number): void {
    this.state.posX[index] = worldX;
    this.state.posY[index] = worldY;
    this.state.grid.markStale();
    this.bumpMotion();
    this.requestDraw();
  }

  setHover(index: number): void {
    if (index === this.hoverIndex) return;
    this.hoverIndex = index;
    this.fx.setHover(index, this.state, performance.now());
    this.canvas.style.cursor = index >= 0 ? "pointer" : "default";
    this.requestDraw();
  }

  destroy(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.interaction.destroy();
  }

  private bumpMotion(): void { this.motionUntil = performance.now() + 140; }

  /** Swap the canvas backing-store resolution (quality ↔ interactive) without re-baking labels. */
  private applyBacking(dpr: number): void {
    this.cam.dpr = dpr;
    this.canvas.width = Math.round(this.cam.width * dpr);
    this.canvas.height = Math.round(this.cam.height * dpr);
  }

  private requestDraw(): void {
    this.dirty = true;
    if (this.rafId == null) this.rafId = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.rafId = null;
    const now = performance.now();
    const animating = isRevealing(this.reveal, now) || this.fx.animating(now, this.reducedMotion);
    // Low-res during pan/zoom (and the reveal fly-in) and while the layout streams;
    // streaming ends crisp on `settled`, not via the 140ms timer. Hover-glow stays crisp.
    const inMotion = isRevealing(this.reveal, now) || now < this.motionUntil || this.layoutStreaming;
    if (!this.dirty && !animating && !inMotion && this.cam.dpr === this.cam.qualityDpr) return;
    this.dirty = false;
    const wantDpr = inMotion ? this.cam.interactiveDpr : this.cam.qualityDpr;
    if (this.cam.dpr !== wantDpr) this.applyBacking(wantDpr);
    renderFrame({
      ctx: this.ctx,
      width: this.cam.width,
      height: this.cam.height,
      dpr: this.cam.dpr,
      camera: this.cam.camera,
      theme: this.theme,
      visual: this.visual,
      state: this.state,
      sprites: this.sprites,
      labels: this.labels,
      reveal: this.reveal,
      time: now,
      focus: this.sel.focusIndices,
      hoverIndex: this.hoverIndex,
      selectedIndex: this.sel.selectedIndex,
      hoverNeighbors: this.fx.neighbors,
      hoverFade: this.fx.labelFade(now, this.reducedMotion),
      reducedMotion: this.reducedMotion,
      lowQuality: inMotion,
    });
    if (this.dirty || animating || inMotion || this.cam.dpr !== this.cam.qualityDpr) {
      this.rafId = requestAnimationFrame(() => this.frame());
    }
  }
}
