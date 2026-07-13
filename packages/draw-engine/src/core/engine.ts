/**
 * The imperative engine facade + render loop. Owns the canvas, the scene, and the
 * camera; exposes setScene/setCamera/zoom/pan/fit/hitTest. The loop mirrors
 * graph-engine's scene.ts: one dirty-driven rAF, reduced backing DPR while the
 * camera is in motion, crisp on settle. Browser-only (rAF + performance.now); the
 * pure cores it composes are node-tested separately.
 */

import { type Camera, IDENTITY, screenToWorld, worldToScreen } from "./camera/transform";
import { fitBounds, panBy, visibleWorldRect, zoomAt } from "./camera/controls";
import { type DrawTheme, LIGHT_THEME, paintBackground, paintGrid, TEXT_LINE_HEIGHT } from "./render/paint";
import { type OverlayTheme, paintMarquee, paintMultiSelectionBox, paintSelectionOverlay } from "./render/overlay";
import { type Arrowhead, bumpVersion, createElement, DEFAULT_ELEMENT_STYLE, type DrawElement, type DrawElementStyle, newElementId } from "./scene/element";
import { hitTest, sceneBounds } from "./scene/geometry";
import { Scene } from "./scene/scene";
import { bindableAt, isBindableElement, isLinearElement, refreshBindings } from "./scene/binding";
import { rectFromDrag } from "./interaction/shapeDrag";
import { isDegenerateLinear, linearFromDrag } from "./interaction/linearDrag";
import { type DrawTool, isLinearTool, isShapeTool } from "./interaction/tools";
import { type SnapGuide, snapMove } from "./interaction/snapping";
import { type HandleKind, hitHandle, selectionHandlePoints } from "./selection/handles";
import { elementsInMarquee, marqueeRect } from "./selection/marquee";
import { resizeElement, rotateElement } from "./selection/transform";
import { materializeElements, serializeSelection } from "./edit/clipboard";
import { reorderElements, type ZOrderMode } from "./edit/zorder";
import { type AlignMode, alignElements, distributeElements } from "./edit/align";
import { type FlipAxis, flipElements } from "./edit/flip";
import { expandToGroups, groupPatches, isSingleGroup, ungroupPatches } from "./edit/group";
import { type FreehandAdapter, loadFreehandAdapter, pointsBounds } from "./freehand/freehandRenderer";
import { loadRoughAdapter, type RoughAdapter } from "./roughen/roughRenderer";
import { SnapshotHistory } from "./history/history";
import { renderScene } from "./render/renderScene";
import { elementsFromJson, sceneToJson } from "./export/json";
import { sceneToSvg } from "./export/svg";

/** Ask the host to open a text editor over a just-created/clicked text element. */
export interface TextEditRequest {
  id: string;
  /** Canvas-local screen position for the editor overlay. */
  x: number;
  y: number;
  fontSize: number;
  color: string;
  text: string;
}

export interface DrawEngineOptions {
  canvas: HTMLCanvasElement;
  onCameraChange?: (camera: Camera) => void;
  onToolChange?: (tool: DrawTool) => void;
  onSelectionChange?: (ids: string[]) => void;
  onRequestTextEdit?: (request: TextEditRequest) => void;
  /** Fired with `.osidraw` JSON after every scene mutation (incl. undo/redo and
   *  clear) so a host can persist it. NOT fired by `loadScene` — that is
   *  hydration, and echoing it back would be a write loop. */
  onSceneChange?: (json: string) => void;
}

const MOTION_MS = 140;
const HANDLE_PX = 8;
const HANDLE_HIT_PX = 10;
const ROTATE_GAP_PX = 26;
const DEFAULT_FONT_SIZE = 20;
/** Screen-px magnet range for object snapping while moving. */
const SNAP_PX = 6;
/** Offset a duplicate/paste lands at, so the copy is visibly a copy. */
const PASTE_OFFSET = 12;

/** The pointer gesture currently in flight (screen/world coords as noted). Move
 *  keeps each element's ORIGIN at gesture start so object snapping is computed
 *  from absolute positions — incremental deltas would make the snap sticky. */
type Interaction =
  | { mode: "draft"; id: string; start: { x: number; y: number } }
  | { mode: "linear"; id: string; start: { x: number; y: number } }
  | { mode: "freedraw"; id: string; start: { x: number; y: number } }
  | { mode: "erase" }
  | { mode: "pan"; lastX: number; lastY: number }
  | { mode: "move"; ids: string[]; start: { x: number; y: number }; origins: Map<string, { x: number; y: number }> }
  | { mode: "resize"; id: string; handle: HandleKind; ratio: number | null }
  | { mode: "rotate"; id: string }
  | { mode: "marquee"; start: { x: number; y: number }; current: { x: number; y: number }; base: Set<string> };

export class DrawEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private scene = new Scene();
  private theme: DrawTheme = LIGHT_THEME;
  private readonly onCameraChange?: (camera: Camera) => void;
  private readonly onToolChange?: (tool: DrawTool) => void;
  private readonly onSelectionChange?: (ids: string[]) => void;
  private readonly onRequestTextEdit?: (request: TextEditRequest) => void;
  private readonly onSceneChange?: (json: string) => void;

  camera: Camera = { ...IDENTITY };
  private width = 0;
  private height = 0;
  private dpr = 1;

  private rafId = 0;
  private motionUntil = 0;
  private disposed = false;

  // Interaction state.
  private tool: DrawTool = "select";
  private toolLocked = false;
  private nextStyle: Partial<DrawElementStyle> = {};
  private nextFontSize = DEFAULT_FONT_SIZE;
  private interaction: Interaction | null = null;
  private readonly selectedIds = new Set<string>();
  /** Fallback clipboard for hosts without ClipboardEvent access (context menu). */
  private clipboardBuffer: string | null = null;
  /** Live snap guides while a move is magnetised — painted by the overlay. */
  private snapGuides: SnapGuide[] = [];

  // Undo/redo over scene snapshots (immutable element refs — mutations always
  // replace, never mutate in place).
  private readonly history = new SnapshotHistory<DrawElement[]>([], (elements) => this.historySignature(elements));

  // Lazily-loaded renderers (kept out of the warm chunk; repaint on arrival).
  private rough: RoughAdapter | null = null;
  private freehand: FreehandAdapter | null = null;
  private roughLoading = false;
  private freehandLoading = false;

  constructor(options: DrawEngineOptions) {
    this.canvas = options.canvas;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("draw-engine: 2D canvas context unavailable");
    this.ctx = ctx;
    this.onCameraChange = options.onCameraChange;
    this.onToolChange = options.onToolChange;
    this.onSelectionChange = options.onSelectionChange;
    this.onRequestTextEdit = options.onRequestTextEdit;
    this.onSceneChange = options.onSceneChange;
    this.ensureRenderers();
    this.requestDraw();
  }

  /** Kick off the lazy roughjs + perfect-freehand loads; repaint when each lands. */
  private ensureRenderers(): void {
    if (!this.rough && !this.roughLoading) {
      this.roughLoading = true;
      loadRoughAdapter(this.canvas)
        .then((adapter) => {
          this.rough = adapter;
          this.requestDraw();
        })
        .catch(() => undefined)
        .finally(() => {
          this.roughLoading = false;
        });
    }
    if (!this.freehand && !this.freehandLoading) {
      this.freehandLoading = true;
      loadFreehandAdapter()
        .then((adapter) => {
          this.freehand = adapter;
          this.requestDraw();
        })
        .catch(() => undefined)
        .finally(() => {
          this.freehandLoading = false;
        });
    }
  }

  private get qualityDpr(): number {
    return Math.min(this.dpr, 2);
  }

  private get interactiveDpr(): number {
    return Math.max(1, this.qualityDpr * 0.5);
  }

  private bumpMotion(): void {
    this.motionUntil = performance.now() + MOTION_MS;
  }

  setScene(scene: Scene): void {
    this.scene = scene;
    this.resetHistory();
    this.requestDraw();
  }

  // -- Undo / redo -----------------------------------------------------------

  private historySignature(elements: readonly DrawElement[]): string {
    return elements
      .map((e) => `${e.id}:${e.version}:${Math.round(e.x)},${Math.round(e.y)},${Math.round(e.width)},${Math.round(e.height)},${e.angle.toFixed(3)}:${e.isDeleted ? 1 : 0}`)
      .join("|");
  }

  /** Record the current scene as an undo step (no-op if nothing changed). */
  private pushHistory(): void {
    this.history.push(this.scene.toArray());
    this.onSceneChange?.(this.exportJson());
  }

  private resetHistory(): void {
    this.history.reset(this.scene.toArray());
  }

  private applySnapshot(snapshot: DrawElement[] | null): void {
    if (!snapshot) return;
    this.scene = new Scene(snapshot);
    this.selectedIds.clear();
    this.onSelectionChange?.([]);
    this.requestDraw();
    // undo/redo bypass pushHistory — persist here or they silently don't save.
    this.onSceneChange?.(this.exportJson());
  }

  undo(): void {
    this.applySnapshot(this.history.undo());
  }

  redo(): void {
    this.applySnapshot(this.history.redo());
  }

  getScene(): Scene {
    return this.scene;
  }

  setTheme(theme: DrawTheme): void {
    this.theme = theme;
    this.requestDraw();
  }

  setViewport(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.requestDraw();
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
    this.onCameraChange?.(camera);
    this.requestDraw();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    this.setCamera(zoomAt(this.camera, sx, sy, factor));
    this.bumpMotion();
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.setCamera(panBy(this.camera, dxScreen, dyScreen));
    this.bumpMotion();
  }

  /** Frame the whole scene, or no-op on an empty scene. */
  fit(padding?: number): void {
    const bounds = this.scene.bounds();
    if (bounds) this.setCamera(fitBounds(bounds, this.width, this.height, padding));
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return screenToWorld(this.camera, sx, sy);
  }

  hitTest(sx: number, sy: number, tolerance = 0): DrawElement | null {
    const world = this.screenToWorld(sx, sy);
    return hitTest(this.scene.ordered(), world.x, world.y, tolerance);
  }

  /** Hit-test that ignores locked elements — what select/move/erase act on.
   *  (The public hitTest still sees locked ones, so a right-click can unlock.) */
  private selectableHit(sx: number, sy: number, tolerance = 0): DrawElement | null {
    const world = this.screenToWorld(sx, sy);
    return hitTest(this.selectable(), world.x, world.y, tolerance);
  }

  private selectable(): DrawElement[] {
    return this.scene.ordered().filter((element) => !element.locked);
  }

  // -- Tools & pointer interaction -------------------------------------------

  setTool(tool: DrawTool): void {
    if (tool === this.tool) return;
    this.tool = tool;
    this.onToolChange?.(tool);
  }

  getTool(): DrawTool {
    return this.tool;
  }

  /** New shapes adopt this style (fed by the inspector; engine defaults otherwise). */
  setNextStyle(style: Partial<DrawElementStyle>): void {
    this.nextStyle = { ...this.nextStyle, ...style };
  }

  /** The style the next drawn shape will use (defaults merged with pending edits). */
  getNextStyle(): DrawElementStyle {
    return { ...DEFAULT_ELEMENT_STYLE, ...this.nextStyle };
  }

  getSelection(): string[] {
    return [...this.selectedIds];
  }

  getSelectedElements(): DrawElement[] {
    return [...this.selectedIds]
      .map((id) => this.scene.get(id))
      .filter((element): element is DrawElement => !!element && !element.isDeleted);
  }

  /** Patch the style of every selected element; with nothing selected, patch the
   *  pending new-shape style instead (so the inspector always does something). */
  applyStyle(patch: Partial<DrawElementStyle>): void {
    const selected = this.getSelectedElements();
    if (selected.length === 0) {
      this.setNextStyle(patch);
      return;
    }
    const now = Date.now();
    for (const element of selected) this.scene.put(bumpVersion(element, patch, now));
    this.pushHistory();
    this.requestDraw();
  }

  private setSelection(ids: Iterable<string>): void {
    this.selectedIds.clear();
    for (const id of ids) this.selectedIds.add(id);
    this.onSelectionChange?.([...this.selectedIds]);
    this.requestDraw();
  }

  clearSelection(): void {
    if (this.selectedIds.size > 0) this.setSelection([]);
  }

  /** Replace the selection (hosts use it to target a right-clicked element). */
  select(ids: string[]): void {
    this.setSelection(ids);
  }

  selectAll(): void {
    this.setSelection(this.scene.ordered().map((element) => element.id));
  }

  /** Tombstone every selected element (Delete/Backspace). A deleted shape takes
   *  its bound label with it; a deleted label unlinks from its container. */
  deleteSelection(): void {
    if (this.selectedIds.size === 0) return;
    const now = Date.now();
    const doomed = new Set(this.selectedIds);
    for (const id of this.selectedIds) {
      const element = this.scene.get(id);
      if (element?.boundTextId) doomed.add(element.boundTextId);
      if (element?.containerId && !doomed.has(element.containerId)) {
        const container = this.scene.get(element.containerId);
        if (container) this.scene.put({ ...container, boundTextId: null });
      }
    }
    for (const id of doomed) this.scene.remove(id, now);
    this.setSelection([]);
    this.pushHistory();
  }

  private singleSelected(): DrawElement | null {
    if (this.selectedIds.size !== 1) return null;
    const [id] = this.selectedIds;
    return this.scene.get(id) ?? null;
  }

  // -- Clipboard / duplicate ---------------------------------------------------

  /** Selection as `.osidraw` JSON (also kept in an internal buffer so the context
   *  menu can paste without ClipboardEvent access). Null when nothing selected. */
  copySelection(): string | null {
    const json = serializeSelection(this.scene.ordered(), this.selectedIds);
    if (json) this.clipboardBuffer = json;
    return json;
  }

  cutSelection(): string | null {
    const json = this.copySelection();
    if (json) this.deleteSelection();
    return json;
  }

  /**
   * Paste `.osidraw` JSON (or the internal buffer when omitted): fresh ids,
   * bindings remapped, landed at `at` (world centre) or nudged by a small offset.
   * Returns false when there was nothing valid to paste.
   */
  pasteJson(json?: string | null, at?: { x: number; y: number }): boolean {
    const payload = json ?? this.clipboardBuffer;
    if (!payload) return false;
    let offsetX = PASTE_OFFSET;
    let offsetY = PASTE_OFFSET;
    if (at) {
      const source = materializeElements(payload, 0, 0, Date.now());
      const bounds = source ? sceneBounds(source) : null;
      if (bounds) {
        offsetX = at.x - (bounds.minX + bounds.maxX) / 2;
        offsetY = at.y - (bounds.minY + bounds.maxY) / 2;
      }
    }
    const pasted = materializeElements(payload, offsetX, offsetY, Date.now());
    if (!pasted || pasted.length === 0) return false;
    for (const element of pasted) this.scene.add(element);
    this.clipboardBuffer = payload;
    this.setTool("select");
    this.setSelection(pasted.map((element) => element.id));
    this.applyBindings();
    this.pushHistory();
    return true;
  }

  /** ⌘D / Alt-drag: clone the selection in place (small offset unless dragging). */
  duplicateSelection(offsetX = PASTE_OFFSET, offsetY = PASTE_OFFSET): void {
    const json = serializeSelection(this.scene.ordered(), this.selectedIds);
    if (!json) return;
    const copies = materializeElements(json, offsetX, offsetY, Date.now());
    if (!copies) return;
    for (const element of copies) this.scene.add(element);
    this.setSelection(copies.map((element) => element.id));
    this.applyBindings();
    this.pushHistory();
  }

  // -- Keyboard move / arrange / group ----------------------------------------

  /** Arrow keys: move the (unlocked) selection by a world-space step. */
  nudgeSelection(dx: number, dy: number): void {
    const targets = this.getSelectedElements().filter((element) => !element.locked);
    if (targets.length === 0) return;
    for (const element of targets) this.scene.put({ ...element, x: element.x + dx, y: element.y + dy });
    this.applyBindings();
    this.pushHistory();
    this.requestDraw();
  }

  /** Z-order: front / back / one step forward / one step backward. */
  reorderSelection(mode: ZOrderMode): void {
    if (this.selectedIds.size === 0) return;
    this.scene.setOrder(reorderElements(this.scene.ordered(), this.selectedIds, mode));
    this.pushHistory();
    this.requestDraw();
  }

  alignSelection(mode: AlignMode): void {
    this.applyPatches(alignElements(this.scene.ordered(), this.selectedIds, mode));
  }

  distributeSelection(axis: "x" | "y"): void {
    this.applyPatches(distributeElements(this.scene.ordered(), this.selectedIds, axis));
  }

  flipSelection(axis: FlipAxis): void {
    this.applyPatches(flipElements(this.scene.ordered(), this.selectedIds, axis));
  }

  /** Put a batch of edited elements back, re-derive bindings, commit once. */
  private applyPatches(patches: DrawElement[]): void {
    if (patches.length === 0) return;
    const now = Date.now();
    for (const element of patches) this.scene.put(bumpVersion(element, {}, now));
    this.applyBindings();
    this.pushHistory();
    this.requestDraw();
  }

  /** ⌘G: the selection becomes one unit (single-level groups). */
  groupSelection(): void {
    if (this.selectedIds.size < 2) return;
    this.applyPatches(groupPatches(this.scene.ordered(), this.selectedIds, newElementId()));
  }

  /** ⌘⇧G. */
  ungroupSelection(): void {
    this.applyPatches(ungroupPatches(this.scene.ordered(), this.selectedIds));
  }

  /** True when the selection is exactly one existing group (→ offer Ungroup). */
  selectionIsGroup(): boolean {
    return isSingleGroup(this.scene.ordered(), this.selectedIds);
  }

  /** Lock ⇄ unlock. Mixed selections lock everything (the safe direction). */
  toggleLockSelection(): void {
    const selected = this.getSelectedElements();
    if (selected.length === 0) return;
    const lock = selected.some((element) => !element.locked);
    this.applyPatches(selected.map((element) => ({ ...element, locked: lock })));
  }

  selectionLocked(): boolean {
    const selected = this.getSelectedElements();
    return selected.length > 0 && selected.every((element) => element.locked);
  }

  // -- Text sizing -------------------------------------------------------------

  /** Set the font size of selected text (labels re-centre); it also becomes the
   *  size the next text element starts with. */
  setFontSize(size: number): void {
    this.nextFontSize = size;
    const texts = this.getSelectedElements().filter((element) => element.type === "text");
    const now = Date.now();
    let changed = false;
    for (const element of texts) {
      const measured = this.measureText(element.text ?? "", size);
      this.scene.put(bumpVersion(element, { fontSize: size, width: measured.width, height: measured.height }, now));
      changed = true;
    }
    if (!changed) return;
    this.applyBindings();
    this.pushHistory();
    this.requestDraw();
  }

  /** The font size shown in the inspector: the selection's (first text), else
   *  what the next text element will use. */
  getFontSize(): number {
    const text = this.getSelectedElements().find((element) => element.type === "text");
    return text?.fontSize ?? this.nextFontSize;
  }

  // -- Zoom / viewport ----------------------------------------------------------

  zoomIn(): void {
    this.zoomAt(this.width / 2, this.height / 2, 1.2);
  }

  zoomOut(): void {
    this.zoomAt(this.width / 2, this.height / 2, 1 / 1.2);
  }

  /** Back to 100%, keeping the viewport centre fixed. */
  zoomReset(): void {
    this.zoomAt(this.width / 2, this.height / 2, 1 / this.camera.scale);
  }

  /** False when a non-empty scene is entirely off-screen (→ show "back to content"). */
  contentInView(): boolean {
    const bounds = this.scene.bounds();
    if (!bounds) return true;
    const view = visibleWorldRect(this.camera, this.width, this.height);
    return bounds.minX <= view.maxX && bounds.maxX >= view.minX && bounds.minY <= view.maxY && bounds.maxY >= view.minY;
  }

  // -- Tool lock ----------------------------------------------------------------

  /** Keep the active tool armed after each drawn shape (Excalidraw's padlock). */
  setToolLocked(locked: boolean): void {
    this.toolLocked = locked;
  }

  getToolLocked(): boolean {
    return this.toolLocked;
  }

  /** Enter: open the text editor for the selected element (its label when it is
   *  a shape/connector). True when something was editable. */
  editSelectedText(): boolean {
    const single = this.singleSelected();
    if (!single || single.isDeleted || single.locked) return false;
    if (single.type === "text") {
      this.requestTextEdit(single);
      return true;
    }
    if (!isBindableElement(single) && !isLinearElement(single)) return false;
    const bound = single.boundTextId ? this.scene.get(single.boundTextId) : undefined;
    const label = bound && !bound.isDeleted ? bound : this.createLabel(single);
    this.setSelection([label.id]);
    this.requestTextEdit(label);
    return true;
  }

  /** Pointer-down at canvas-local screen (sx,sy). `additive` = Shift
   *  (multi-select); `duplicate` = Alt (drag away a copy). */
  beginPointer(sx: number, sy: number, additive = false, duplicate = false): void {
    const world = this.screenToWorld(sx, sy);
    if (isShapeTool(this.tool)) {
      const element = createElement(this.tool, { x: world.x, y: world.y, width: 0, height: 0 }, this.nextStyle, Date.now());
      this.scene.add(element);
      this.interaction = { mode: "draft", id: element.id, start: world };
      this.requestDraw();
      return;
    }
    if (isLinearTool(this.tool)) {
      // Starting ON a shape binds this end to it, so the connector follows that
      // shape for the rest of its life.
      const anchor = bindableAt(this.scene.ordered(), world.x, world.y, 0);
      const element: DrawElement = {
        ...createElement(this.tool, { x: world.x, y: world.y, width: 0, height: 0 }, this.nextStyle, Date.now()),
        points: [
          [0, 0],
          [0, 0],
        ],
        startBinding: anchor?.id ?? null,
        endBinding: null,
      };
      this.scene.add(element);
      this.interaction = { mode: "linear", id: element.id, start: world };
      this.requestDraw();
      return;
    }
    if (this.tool === "eraser") {
      this.interaction = { mode: "erase" };
      this.eraseAt(sx, sy);
      return;
    }
    if (this.tool === "freedraw") {
      const element: DrawElement = {
        ...createElement("freedraw", { x: world.x, y: world.y, width: 0, height: 0 }, this.nextStyle, Date.now()),
        points: [[0, 0]],
      };
      this.scene.add(element);
      this.interaction = { mode: "freedraw", id: element.id, start: world };
      this.requestDraw();
      return;
    }
    if (this.tool === "text") {
      const element: DrawElement = {
        ...createElement("text", { x: world.x, y: world.y, width: 4, height: this.nextFontSize }, this.nextStyle, Date.now()),
        text: "",
        fontSize: this.nextFontSize,
      };
      this.scene.add(element);
      this.setSelection([element.id]);
      this.onRequestTextEdit?.({ id: element.id, x: sx, y: sy, fontSize: this.nextFontSize, color: element.strokeColor, text: "" });
      this.settleTool();
      return;
    }
    if (this.tool === "hand") {
      this.interaction = { mode: "pan", lastX: sx, lastY: sy };
      return;
    }
    this.beginSelect(sx, sy, world, additive, duplicate);
  }

  /** Force a pan gesture regardless of tool (middle mouse / held Space). */
  beginPan(sx: number, sy: number): void {
    this.interaction = { mode: "pan", lastX: sx, lastY: sy };
  }

  /** The select-tool pointer-down: handle press → resize/rotate; hit → move; miss → marquee. */
  private beginSelect(sx: number, sy: number, world: { x: number; y: number }, additive: boolean, duplicate = false): void {
    const single = this.singleSelected();
    if (single && !single.locked) {
      const worldTol = HANDLE_HIT_PX / this.camera.scale;
      const handle = hitHandle(selectionHandlePoints(single, ROTATE_GAP_PX / this.camera.scale), world.x, world.y, worldTol);
      if (handle === "rotate") {
        this.interaction = { mode: "rotate", id: single.id };
        return;
      }
      if (handle) {
        const ratio = Math.abs(single.height) > 0.01 ? Math.abs(single.width / single.height) : null;
        this.interaction = { mode: "resize", id: single.id, handle, ratio };
        return;
      }
    }
    const hit = this.selectableHit(sx, sy, 2);
    if (hit) {
      // A grouped element selects (and moves) as its whole group.
      const hitIds = expandToGroups(this.scene.ordered(), [hit.id]);
      if (additive) {
        const has = this.selectedIds.has(hit.id);
        for (const id of hitIds) {
          if (has) this.selectedIds.delete(id);
          else this.selectedIds.add(id);
        }
        this.onSelectionChange?.([...this.selectedIds]);
      } else if (!this.selectedIds.has(hit.id)) {
        this.setSelection(hitIds);
      }
      if (duplicate) this.duplicateSelection(0, 0);
      this.beginMove(world);
      return;
    }
    if (!additive) this.clearSelection();
    this.interaction = { mode: "marquee", start: world, current: world, base: new Set(this.selectedIds) };
    this.requestDraw();
  }

  /** Start moving the current selection: capture each element's origin so snap
   *  works from absolute positions. Locked elements stay put. */
  private beginMove(world: { x: number; y: number }): void {
    const origins = new Map<string, { x: number; y: number }>();
    for (const element of this.getSelectedElements()) {
      if (!element.locked) origins.set(element.id, { x: element.x, y: element.y });
    }
    this.interaction = { mode: "move", ids: [...origins.keys()], start: world, origins };
    this.requestDraw();
  }

  /** Pointer-move: advance the in-flight gesture. `square` (Shift) locks a draft
   *  1:1 / a resize to its ratio; `bypassSnap` (Alt) disables object snapping. */
  movePointer(sx: number, sy: number, square = false, bypassSnap = false): void {
    const it = this.interaction;
    if (!it) return;
    const world = this.screenToWorld(sx, sy);
    switch (it.mode) {
      case "draft": {
        const element = this.scene.get(it.id);
        if (element) {
          this.scene.put({ ...element, ...rectFromDrag(it.start.x, it.start.y, world.x, world.y, square) });
          this.requestDraw();
        }
        return;
      }
      case "linear": {
        const element = this.scene.get(it.id);
        if (element) {
          // Live-bind the far end to whatever shape is under the cursor, so the
          // connector snaps to it the moment you release.
          const over = bindableAt(this.scene.ordered(), world.x, world.y, 0, it.id);
          this.scene.put({
            ...element,
            ...linearFromDrag(it.start.x, it.start.y, world.x, world.y, square),
            endBinding: over && over.id !== element.startBinding ? over.id : null,
          });
          this.requestDraw();
        }
        return;
      }
      case "freedraw": {
        const element = this.scene.get(it.id);
        if (element?.points) {
          this.scene.put({ ...element, points: [...element.points, [world.x - it.start.x, world.y - it.start.y]] });
          this.requestDraw();
        }
        return;
      }
      case "erase":
        this.eraseAt(sx, sy);
        return;
      case "pan":
        this.panBy(sx - it.lastX, sy - it.lastY);
        it.lastX = sx;
        it.lastY = sy;
        return;
      case "move": {
        let dx = world.x - it.start.x;
        let dy = world.y - it.start.y;
        this.snapGuides = [];
        if (!bypassSnap) {
          const moving = new Set(it.ids);
          const movingElements = it.ids
            .map((id) => this.scene.get(id))
            .filter((element): element is DrawElement => !!element)
            .map((element) => {
              const origin = it.origins.get(element.id) as { x: number; y: number };
              return { ...element, x: origin.x + dx, y: origin.y + dy };
            });
          const bounds = sceneBounds(movingElements);
          const statics = this.scene
            .ordered()
            .filter((element) => !moving.has(element.id) && !(element.containerId && moving.has(element.containerId)))
            .map((element) => sceneBounds([element]))
            .filter((b): b is NonNullable<typeof b> => !!b);
          if (bounds) {
            const snap = snapMove(bounds, statics, SNAP_PX / this.camera.scale);
            dx += snap.dx;
            dy += snap.dy;
            this.snapGuides = snap.guides;
          }
        }
        for (const id of it.ids) {
          const element = this.scene.get(id);
          const origin = it.origins.get(id);
          if (element && origin) this.scene.put({ ...element, x: origin.x + dx, y: origin.y + dy });
        }
        // Connectors + labels track the shape live, not just on drop.
        this.applyBindings();
        this.requestDraw();
        return;
      }
      case "resize": {
        const element = this.scene.get(it.id);
        if (element) {
          this.scene.put({ ...element, ...resizeElement(element, it.handle, world.x, world.y, 1, square ? it.ratio : null) });
          this.applyBindings();
          this.requestDraw();
        }
        return;
      }
      case "rotate": {
        const element = this.scene.get(it.id);
        if (element) {
          this.scene.put({ ...element, angle: rotateElement(element, world.x, world.y) });
          this.requestDraw();
        }
        return;
      }
      case "marquee":
        it.current = world;
        this.requestDraw();
        return;
    }
  }

  /** After committing a drawn element: back to select — unless the tool is
   *  locked, in which case the same tool stays armed for the next shape. */
  private settleTool(): void {
    if (!this.toolLocked) this.setTool("select");
  }

  /** Pointer-up: finalise (commit draft, resolve marquee). */
  endPointer(): void {
    const it = this.interaction;
    this.interaction = null;
    this.snapGuides = [];
    if (!it) return;
    if (it.mode === "draft") {
      const element = this.scene.get(it.id);
      if (element && element.width < 2 && element.height < 2) {
        this.scene.discard(element.id);
        this.setTool("select");
        this.requestDraw();
        return;
      }
      this.settleTool();
      this.setSelection([it.id]);
      this.pushHistory();
      return;
    }
    if (it.mode === "linear") {
      const element = this.scene.get(it.id);
      if (!element || isDegenerateLinear(element.width, element.height)) {
        if (element) this.scene.discard(element.id);
        this.setTool("select");
        this.requestDraw();
        return;
      }
      this.settleTool();
      this.applyBindings();
      this.setSelection([it.id]);
      this.pushHistory();
      return;
    }
    if (it.mode === "freedraw") {
      const element = this.scene.get(it.id);
      if (element?.points && element.points.length > 1) {
        const [minX, minY, maxX, maxY] = pointsBounds(element.points);
        const shifted = element.points.map(([px, py]): [number, number] => [px - minX, py - minY]);
        this.scene.put({
          ...element,
          x: element.x + minX,
          y: element.y + minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
          points: shifted,
        });
        this.settleTool();
        this.setSelection([element.id]);
        this.pushHistory();
        return;
      }
      if (element) this.scene.discard(element.id);
      this.setTool("select");
      this.requestDraw();
      return;
    }
    if (it.mode === "marquee") {
      const hits = elementsInMarquee(this.selectable(), marqueeRect(it.start.x, it.start.y, it.current.x, it.current.y));
      // A marquee that clips part of a group takes the whole group.
      this.setSelection(expandToGroups(this.scene.ordered(), [...it.base, ...hits]));
      return;
    }
    // move / resize / rotate committed (pan is a no-op for history — deduped).
    this.applyBindings();
    this.pushHistory();
    this.requestDraw();
  }

  /**
   * Re-derive every bound arrow endpoint and every contained label from the shapes
   * they are attached to. Called after any geometry change — the ONE place bound
   * geometry is computed, so a connector can never drift off the shape it joins.
   */
  private applyBindings(): void {
    for (const element of refreshBindings(this.scene.ordered())) this.scene.put(element);
  }

  /** Esc: abandon the in-flight gesture (discard any draft) and deselect. */
  cancelPointer(): void {
    const it = this.interaction;
    this.interaction = null;
    this.snapGuides = [];
    if (it?.mode === "draft" || it?.mode === "freedraw" || it?.mode === "linear") {
      this.scene.discard(it.id);
      this.setTool("select");
    }
    this.clearSelection();
    this.requestDraw();
  }

  private eraseAt(sx: number, sy: number): void {
    const hit = this.selectableHit(sx, sy, 4);
    if (hit) {
      this.scene.remove(hit.id, Date.now());
      if (this.selectedIds.delete(hit.id)) this.onSelectionChange?.([...this.selectedIds]);
      this.requestDraw();
    }
  }

  /** Set the tip at either end of every selected line/arrow (the right-click menu). */
  setArrowheads(patch: { start?: Arrowhead; end?: Arrowhead }): void {
    const linears = this.getSelectedElements().filter((element) => isLinearElement(element));
    if (linears.length === 0) return;
    const now = Date.now();
    for (const element of linears) {
      this.scene.put(
        bumpVersion(
          element,
          {
            ...(patch.start === undefined ? {} : { startArrowhead: patch.start }),
            ...(patch.end === undefined ? {} : { endArrowhead: patch.end }),
          },
          now,
        ),
      );
    }
    this.pushHistory();
    this.requestDraw();
  }

  /** Ask the host to open its text overlay over `element`. */
  private requestTextEdit(element: DrawElement): void {
    const screen = worldToScreen(this.camera, element.x, element.y);
    this.onRequestTextEdit?.({
      id: element.id,
      x: screen.x,
      y: screen.y,
      fontSize: element.fontSize ?? DEFAULT_FONT_SIZE,
      color: element.strokeColor,
      text: element.text ?? "",
    });
  }

  /** Attach a fresh, empty label to `container` — a shape (fills its inner box)
   *  or a connector (rides its midpoint). Positioned by the binding pass. */
  private createLabel(container: DrawElement): DrawElement {
    const width = isLinearElement(container) ? 8 : Math.max(8, Math.abs(container.width) - 16);
    const label: DrawElement = {
      ...createElement(
        "text",
        { x: container.x, y: container.y, width, height: this.nextFontSize },
        { ...this.nextStyle, strokeColor: this.getNextStyle().strokeColor },
        Date.now(),
      ),
      text: "",
      fontSize: this.nextFontSize,
      containerId: container.id,
    };
    this.scene.add(label);
    this.scene.put({ ...container, boundTextId: label.id });
    this.applyBindings();
    return this.scene.get(label.id) ?? label;
  }

  /** Shape or connector under the point that can carry a label. */
  private labelTargetAt(wx: number, wy: number): DrawElement | null {
    const shape = bindableAt(this.selectable(), wx, wy, 0);
    if (shape) return shape;
    const hit = hitTest(this.selectable(), wx, wy, 2);
    return hit && isLinearElement(hit) ? hit : null;
  }

  /**
   * Double-click — the way text actually gets written:
   *  - on a shape or connector → edit its label, creating a centred one if none;
   *  - on a text   → re-edit it;
   *  - empty canvas → start a free text element right there.
   */
  handleDoubleClick(sx: number, sy: number): void {
    const world = this.screenToWorld(sx, sy);
    const hit = hitTest(this.selectable(), world.x, world.y, 2);
    if (hit?.type === "text") {
      this.setSelection([hit.id]);
      this.requestTextEdit(hit);
      return;
    }
    const container = this.labelTargetAt(world.x, world.y);
    if (container) {
      const bound = container.boundTextId ? this.scene.get(container.boundTextId) : undefined;
      const label = bound && !bound.isDeleted ? bound : this.createLabel(container);
      this.setSelection([label.id]);
      this.requestTextEdit(label);
      return;
    }

    const element: DrawElement = {
      ...createElement("text", { x: world.x, y: world.y, width: 4, height: this.nextFontSize }, this.nextStyle, Date.now()),
      text: "",
      fontSize: this.nextFontSize,
    };
    this.scene.add(element);
    this.setSelection([element.id]);
    this.requestTextEdit(element);
  }

  /** Commit edited text; empty text discards the element. Resizes to fit. */
  setElementText(id: string, text: string): void {
    const element = this.scene.get(id);
    if (!element) return;
    if (text.trim() === "") {
      // Dropping a label must also unlink it from its container, or the shape
      // keeps pointing at a tombstone and never accepts a new label.
      if (element.containerId) {
        const container = this.scene.get(element.containerId);
        if (container) this.scene.put({ ...container, boundTextId: null });
      }
      this.scene.discard(id);
      this.clearSelection();
      this.requestDraw();
      return;
    }
    const fontSize = element.fontSize ?? DEFAULT_FONT_SIZE;
    const size = this.measureText(text, fontSize);
    this.scene.put(bumpVersion(element, { text, width: size.width, height: size.height }, Date.now()));
    this.applyBindings();
    this.pushHistory();
    this.requestDraw();
  }

  private measureText(text: string, fontSize: number): { width: number; height: number } {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${fontSize}px sans-serif`;
    const lines = text.split("\n");
    let width = 0;
    for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
    ctx.restore();
    return { width: Math.max(4, width), height: Math.max(fontSize, lines.length * fontSize * TEXT_LINE_HEIGHT) };
  }

  requestDraw(): void {
    if (this.disposed || this.rafId) return;
    this.rafId = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.rafId = 0;
    if (this.disposed) return;
    const inMotion = performance.now() < this.motionUntil;
    const wantDpr = inMotion ? this.interactiveDpr : this.qualityDpr;
    this.applyBacking(wantDpr);
    this.paint(wantDpr);
    if (inMotion) this.requestDraw();
  }

  private applyBacking(dpr: number): void {
    const bw = Math.max(1, Math.round(this.width * dpr));
    const bh = Math.max(1, Math.round(this.height * dpr));
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
  }

  private paint(dpr: number): void {
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    paintBackground(ctx, this.theme, this.width, this.height);
    paintGrid(ctx, this.camera, this.width, this.height, this.theme);
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.scale, this.camera.scale);
    this.paintElements(ctx);
    ctx.restore();
    this.paintOverlay(ctx);
  }

  /** Per-element renderer choice (freehand / hand-drawn / clean) — shared with export. */
  private paintElements(ctx: CanvasRenderingContext2D): void {
    renderScene(ctx, this.scene.ordered(), this.rough, this.freehand, this.theme.background);
  }

  // -- Export / load ---------------------------------------------------------

  exportJson(): string {
    return sceneToJson(this.scene.ordered());
  }

  exportSvg(padding = 16): string | null {
    const bounds = this.scene.bounds();
    if (!bounds) return null;
    return sceneToSvg(this.scene.ordered(), bounds, padding, this.theme.background);
  }

  /** Render the scene to a PNG blob at `scale`×, or null when the scene is empty. */
  async exportPng(padding = 16, scale = 2): Promise<Blob | null> {
    const bounds = this.scene.bounds();
    if (!bounds) return null;
    const width = bounds.maxX - bounds.minX + padding * 2;
    const height = bounds.maxY - bounds.minY + padding * 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(0, 0, width, height);
    ctx.translate(padding - bounds.minX, padding - bounds.minY);
    const rough = await loadRoughAdapter(canvas);
    const freehand = this.freehand ?? (await loadFreehandAdapter());
    renderScene(ctx, this.scene.ordered(), rough, freehand, this.theme.background);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  }

  /** Load an `.osidraw` document, replacing the scene. Returns false if invalid. */
  loadScene(json: string): boolean {
    const elements = elementsFromJson(json);
    if (!elements) return false;
    this.setScene(new Scene(elements));
    return true;
  }

  /** Empty the canvas (fresh scene, cleared selection + history). */
  clear(): void {
    this.setScene(new Scene());
    this.setSelection([]);
    this.onSceneChange?.(this.exportJson());
  }

  /** Selection box + handles + marquee + snap guides, in screen space. */
  private paintOverlay(ctx: CanvasRenderingContext2D): void {
    const overlayTheme: OverlayTheme = { accent: this.theme.accent, handleFill: this.theme.background };
    const it = this.interaction;
    if (it?.mode === "marquee") {
      paintMarquee(ctx, this.camera, marqueeRect(it.start.x, it.start.y, it.current.x, it.current.y), overlayTheme);
    }
    for (const guide of this.snapGuides) {
      const a = guide.axis === "x"
        ? worldToScreen(this.camera, guide.at, guide.from)
        : worldToScreen(this.camera, guide.from, guide.at);
      const b = guide.axis === "x"
        ? worldToScreen(this.camera, guide.at, guide.to)
        : worldToScreen(this.camera, guide.to, guide.at);
      ctx.save();
      ctx.strokeStyle = this.theme.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
    const selected = [...this.selectedIds]
      .map((id) => this.scene.get(id))
      .filter((element): element is DrawElement => !!element && !element.isDeleted);
    if (selected.length === 1) {
      paintSelectionOverlay(ctx, this.camera, selected[0], ROTATE_GAP_PX / this.camera.scale, overlayTheme, HANDLE_PX);
    } else if (selected.length > 1) {
      const bounds = sceneBounds(selected);
      if (bounds) paintMultiSelectionBox(ctx, this.camera, bounds, overlayTheme);
    }
  }

  destroy(): void {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }
}
