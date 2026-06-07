/**
 * GraphEngine — the framework-agnostic facade the React adapter drives. It owns
 * the aurora background, the Canvas2D scene, and the worker layout controller, and
 * exposes a small imperative API (setModel/setControls/setTheme/camera/search/
 * export). No React, no data fetching — the host passes in a GraphModel.
 */

import type { GraphModel, NodeId } from "./types";
import type { Camera, WorldBounds } from "./camera/transform";
import { type Controls, DEFAULT_CONTROLS } from "./state/controls";
import { LayoutController } from "./layout/layoutBridge";
import { AuroraBackground } from "./render/background";
import { CanvasScene } from "./render/scene";
import { resolveSceneTheme } from "./theme/tokens";

export interface EngineCallbacks {
  onSelect: (id: NodeId | null) => void;
  onHover: (id: NodeId | null) => void;
  onExpand?: (id: NodeId) => void;
}

export interface MinimapData {
  x: Float32Array;
  y: Float32Array;
  count: number;
  visible: Uint8Array;
  bounds: WorldBounds | null;
  camera: Camera;
  width: number;
  height: number;
}

export interface GraphEngineOptions {
  graphCanvas: HTMLCanvasElement;
  bgCanvas: HTMLCanvasElement;
  /** Element to read live `--osio-*` tokens from (usually document.documentElement). */
  themeRoot: HTMLElement;
  reducedMotion: boolean;
  callbacks: EngineCallbacks;
}

export class GraphEngine {
  private readonly scene: CanvasScene;
  private readonly background: AuroraBackground;
  private readonly bgCanvas: HTMLCanvasElement;
  private layout: LayoutController | null = null;
  private controls: Controls = DEFAULT_CONTROLS;
  private width = 800;
  private height = 600;

  constructor(private readonly options: GraphEngineOptions) {
    const theme = resolveSceneTheme(options.themeRoot);
    this.bgCanvas = options.bgCanvas;
    this.background = new AuroraBackground(options.bgCanvas, theme, options.reducedMotion);
    this.scene = new CanvasScene(options.graphCanvas, theme, this.sceneCallbacks(), options.reducedMotion);
    this.background.start();
  }

  setSize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.background.setSize(width, height, dpr);
    this.scene.setSize(width, height, dpr);
  }

  setModel(model: GraphModel): void {
    this.scene.setGraph(model);
    if (!this.layout) {
      this.layout = new LayoutController({
        width: this.width,
        height: this.height,
        params: this.controls.physics,
        onPositions: (x, y) => this.scene.setPositions(x, y),
      });
    }
    this.layout.rebuild(model);
    this.scene.setControls(this.controls);
  }

  setControls(controls: Controls): void {
    this.controls = controls;
    this.scene.setControls(controls);
    this.background.setStyle(controls.visual.background);
    this.layout?.setParams(controls.physics);
  }

  setTheme(): void {
    const theme = resolveSceneTheme(this.options.themeRoot);
    this.scene.setTheme(theme);
    this.background.setTheme(theme);
  }

  setSelected(id: NodeId | null): void {
    this.scene.setSelected(id);
  }

  setFocus(ids: ReadonlySet<NodeId> | null): void {
    this.scene.setFocus(ids);
  }

  fit(): void {
    this.scene.fit();
  }

  zoomBy(factor: number): void {
    this.scene.zoomBy(factor);
  }

  resetView(): void {
    this.scene.resetView();
  }

  reheat(): void {
    this.layout?.reheat();
  }

  freeze(): void {
    this.layout?.freeze();
  }

  /** One-shot snapshot for the minimap overview (live position refs, no copy). */
  getMinimapData(): MinimapData {
    const positions = this.scene.getPositionsRef();
    const viewport = this.scene.getViewportSize();
    return {
      ...positions,
      bounds: this.scene.worldBounds(),
      camera: this.scene.getCamera(),
      width: viewport.width,
      height: viewport.height,
    };
  }

  /** Recenter the camera on a world point (minimap click/drag). */
  centerOnWorld(worldX: number, worldY: number): void {
    this.scene.centerOnWorld(worldX, worldY);
  }

  /**
   * Find the first node whose label contains `query` and center the camera on it.
   * Selection + focus-dimming are driven by the host (React state) via setSelected
   * / setFocus, so we only move the camera here and return the matched id.
   */
  search(query: string): NodeId | null {
    const model = this.scene.getModel();
    if (!model || !query.trim()) return null;
    const needle = query.trim().toLowerCase();
    const match = model.nodes.find((node) => node.label.toLowerCase().includes(needle));
    if (!match) return null;
    this.scene.focusOn(match.id);
    return match.id;
  }

  /** Composite the aurora + graph canvases into a PNG data URL. */
  exportPng(): string {
    const graph = this.scene.canvas;
    const tmp = document.createElement("canvas");
    tmp.width = graph.width;
    tmp.height = graph.height;
    const ctx = tmp.getContext("2d");
    if (!ctx) return graph.toDataURL("image/png");
    ctx.drawImage(this.bgCanvas, 0, 0);
    ctx.drawImage(graph, 0, 0);
    return tmp.toDataURL("image/png");
  }

  exportSvg(): string {
    return this.scene.exportSvg();
  }

  getModel(): GraphModel | null {
    return this.scene.getModel();
  }

  destroy(): void {
    this.background.destroy();
    this.scene.destroy();
    this.layout?.dispose();
  }

  private sceneCallbacks() {
    return {
      onSelect: (id: NodeId | null) => this.options.callbacks.onSelect(id),
      onHover: (id: NodeId | null) => this.options.callbacks.onHover(id),
      onNodeDragStart: () => {},
      onNodeDrag: (id: NodeId, wx: number, wy: number) => this.layout?.pinNode(id, wx, wy),
      onNodeDragEnd: (id: NodeId) => this.layout?.unpinNode(id),
      onExpand: (id: NodeId) => this.options.callbacks.onExpand?.(id),
    };
  }
}
