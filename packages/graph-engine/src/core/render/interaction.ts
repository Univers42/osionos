/**
 * Pointer/wheel/dblclick interaction for the canvas, decoupled from the scene via
 * a small `InteractionHost` interface (no back-reference to the scene class). Pan
 * on empty drag, drag a node when grabbed, hover hit-testing, cursor-anchored
 * wheel zoom, double-click to expand a neighborhood.
 */

import { type Camera, screenToWorld } from "../camera/transform";
import { panBy, zoomAt } from "../camera/controls";
import type { NodeId } from "../types";

export interface SceneCallbacks {
  onSelect: (id: NodeId | null) => void;
  onHover: (id: NodeId | null) => void;
  onNodeDragStart: (id: NodeId) => void;
  onNodeDrag: (id: NodeId, worldX: number, worldY: number) => void;
  onNodeDragEnd: (id: NodeId) => void;
  /** Double-click a node — used to expand its neighborhood (BaaS mode). */
  onExpand?: (id: NodeId) => void;
}

export interface InteractionHost {
  readonly canvas: HTMLCanvasElement;
  getCamera(): Camera;
  setCamera(camera: Camera): void;
  hitTestLocal(x: number, y: number): number;
  idAt(index: number): NodeId;
  setNodePosition(index: number, worldX: number, worldY: number): void;
  setHover(index: number): void;
}

const CLICK_DRAG_THRESHOLD = 5;

export class SceneInteraction {
  private panning = false;
  private dragIndex = -1;
  private pointerStart = { x: 0, y: 0 };
  private pointerMoved = false;
  private lastHover = -1;

  private readonly onWheel = (e: WheelEvent): void => this.wheel(e);
  private readonly onDown = (e: PointerEvent): void => this.down(e);
  private readonly onMove = (e: PointerEvent): void => this.move(e);
  private readonly onUp = (e: PointerEvent): void => this.up(e);
  private readonly onDouble = (e: MouseEvent): void => this.double(e);

  constructor(
    private readonly host: InteractionHost,
    private readonly callbacks: SceneCallbacks,
  ) {
    const c = host.canvas;
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("dblclick", this.onDouble);
    globalThis.addEventListener("pointerup", this.onUp);
  }

  destroy(): void {
    const c = this.host.canvas;
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("dblclick", this.onDouble);
    globalThis.removeEventListener("pointerup", this.onUp);
  }

  private local(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.host.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private down(event: PointerEvent): void {
    const point = this.local(event);
    this.pointerStart = point;
    this.pointerMoved = false;
    this.host.canvas.setPointerCapture(event.pointerId);
    const hit = this.host.hitTestLocal(point.x, point.y);
    if (hit >= 0) {
      this.dragIndex = hit;
      this.callbacks.onNodeDragStart(this.host.idAt(hit));
    } else {
      this.panning = true;
    }
  }

  private move(event: PointerEvent): void {
    const point = this.local(event);
    if (Math.hypot(point.x - this.pointerStart.x, point.y - this.pointerStart.y) > CLICK_DRAG_THRESHOLD) {
      this.pointerMoved = true;
    }
    if (this.dragIndex >= 0) {
      const world = screenToWorld(this.host.getCamera(), point.x, point.y);
      this.host.setNodePosition(this.dragIndex, world.x, world.y);
      this.callbacks.onNodeDrag(this.host.idAt(this.dragIndex), world.x, world.y);
      return;
    }
    if (this.panning) {
      this.host.setCamera(panBy(this.host.getCamera(), event.movementX, event.movementY));
      return;
    }
    const hovered = this.host.hitTestLocal(point.x, point.y);
    this.host.setHover(hovered);
    if (hovered !== this.lastHover) {
      this.lastHover = hovered;
      this.callbacks.onHover(hovered >= 0 ? this.host.idAt(hovered) : null);
    }
  }

  private up(event: PointerEvent): void {
    if (this.dragIndex >= 0) {
      const id = this.host.idAt(this.dragIndex);
      this.callbacks.onNodeDragEnd(id);
      if (!this.pointerMoved) this.callbacks.onSelect(id);
      this.dragIndex = -1;
    } else if (this.panning && !this.pointerMoved) {
      this.callbacks.onSelect(null);
    }
    this.panning = false;
    if (this.host.canvas.hasPointerCapture(event.pointerId)) {
      this.host.canvas.releasePointerCapture(event.pointerId);
    }
  }

  private wheel(event: WheelEvent): void {
    event.preventDefault();
    const point = this.local(event);
    this.host.setCamera(zoomAt(this.host.getCamera(), point.x, point.y, event.deltaY < 0 ? 1.12 : 0.89));
  }

  private double(event: MouseEvent): void {
    const point = this.local(event);
    const hit = this.host.hitTestLocal(point.x, point.y);
    if (hit >= 0) this.callbacks.onExpand?.(this.host.idAt(hit));
  }
}
