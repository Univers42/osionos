/**
 * The scene: an ordered collection of elements. A Map keyed by id preserves
 * insertion order, which IS the z-order for Phase 0 (explicit fractional
 * reordering arrives with the layers panel in Phase 2). Pure data + mutations —
 * the renderer reads `ordered()`; no DOM here.
 */

import type { WorldBounds } from "../camera/transform";
import type { DrawElement } from "./element";
import { sceneBounds } from "./geometry";

export class Scene {
  private readonly byId = new Map<string, DrawElement>();
  /** Memoised `ordered()` result — one drag event reads the live list 5+ times
   *  (paint, hit-test, bindings, selectable, bounds), so the filtered array is
   *  rebuilt only after a mutation. The cached array is SHARED between callers
   *  and must be treated as read-only; every consumer copies before sorting or
   *  reordering (and mutators never touch it — they just drop the cache). */
  private orderedCache: DrawElement[] | null = null;

  constructor(elements: readonly DrawElement[] = []) {
    for (const element of elements) this.byId.set(element.id, element);
  }

  /** Live elements in z-order (deleted ones filtered out). Shared array — treat
   *  as read-only; copy before mutating. */
  ordered(): DrawElement[] {
    if (this.orderedCache) return this.orderedCache;
    const out: DrawElement[] = [];
    for (const element of this.byId.values()) {
      if (!element.isDeleted) out.push(element);
    }
    this.orderedCache = out;
    return out;
  }

  get(id: string): DrawElement | undefined {
    return this.byId.get(id);
  }

  size(): number {
    return this.ordered().length;
  }

  add(element: DrawElement): void {
    this.byId.set(element.id, element);
    this.orderedCache = null;
  }

  /** Replace an element (same id keeps its z-position). */
  put(element: DrawElement): void {
    this.byId.set(element.id, element);
    this.orderedCache = null;
  }

  /** Soft-delete: tombstoned so collab peers converge, never dropped outright. */
  remove(id: string, now = 0): void {
    const element = this.byId.get(id);
    if (element) this.byId.set(id, { ...element, isDeleted: true, version: element.version + 1, updated: now });
    this.orderedCache = null;
  }

  /** Hard-drop with no tombstone — for a draft that was never really created
   *  (a click that didn't become a shape); peers never saw it, so nothing to sync. */
  discard(id: string): void {
    this.byId.delete(id);
    this.orderedCache = null;
  }

  /** Bring an element to the front (end of z-order) by re-inserting it. */
  bringToFront(id: string): void {
    const element = this.byId.get(id);
    if (!element) return;
    this.byId.delete(id);
    this.byId.set(id, element);
    this.orderedCache = null;
  }

  /** Rebuild the z-order from `live` (tombstones are kept, parked at the back —
   *  their order is invisible; history snapshots keep their own copies). */
  setOrder(live: readonly DrawElement[]): void {
    const tombstones = [...this.byId.values()].filter((element) => element.isDeleted);
    this.byId.clear();
    for (const element of tombstones) this.byId.set(element.id, element);
    for (const element of live) this.byId.set(element.id, element);
    this.orderedCache = null;
  }

  bounds(): WorldBounds | null {
    return sceneBounds(this.ordered());
  }

  /** Snapshot for persistence / export (live + tombstoned). */
  toArray(): DrawElement[] {
    return [...this.byId.values()];
  }
}
