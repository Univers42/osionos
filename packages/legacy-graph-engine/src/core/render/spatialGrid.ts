/**
 * Uniform spatial hash grid over the columnar SceneState positions, for
 * frame culling and pointer hit-testing at 10k+ nodes. Counting-sort into
 * reused Int32Arrays (zero steady-state allocation); rebuilt lazily when the
 * position version changes (layout ticks bump it, queries between ticks reuse
 * the same build). Cell size ≥64 world units keeps point queries to a 3×3
 * neighborhood at the maximum hit reach (~59 = MAX_RADIUS 22 × scale 2.5 + 4).
 */

import type { WorldBounds } from "../camera/transform";

const MIN_CELL = 64;
const MAX_COLS = 128;

export class SpatialGrid {
  private version = -1;
  private built = -1;
  private cols = 1;
  private rows = 1;
  private cell = MIN_CELL;
  private minX = 0;
  private minY = 0;
  private cellStart = new Int32Array(2);
  private cursor = new Int32Array(2);
  private entries = new Int32Array(0);

  /** Signal that positions changed; the next query triggers a rebuild. */
  markStale(): void {
    this.version += 1;
  }

  /** Rebuild the grid if stale. O(n) counting sort, reused buffers. */
  rebuild(posX: Float32Array, posY: Float32Array, count: number): void {
    if (this.built === this.version) return;
    this.built = this.version;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < count; i += 1) {
      if (posX[i] < minX) minX = posX[i];
      if (posX[i] > maxX) maxX = posX[i];
      if (posY[i] < minY) minY = posY[i];
      if (posY[i] > maxY) maxY = posY[i];
    }
    if (count === 0 || !Number.isFinite(minX)) {
      this.cols = 1;
      this.rows = 1;
      if (this.cellStart.length < 2) this.cellStart = new Int32Array(2);
      this.cellStart.fill(0, 0, 2);
      return;
    }
    this.minX = minX;
    this.minY = minY;
    this.cell = Math.max(MIN_CELL, (maxX - minX) / MAX_COLS, (maxY - minY) / MAX_COLS);
    this.cols = Math.max(1, Math.floor((maxX - minX) / this.cell) + 1);
    this.rows = Math.max(1, Math.floor((maxY - minY) / this.cell) + 1);
    const cells = this.cols * this.rows;
    if (this.cellStart.length < cells + 1) this.cellStart = new Int32Array(cells + 1);
    else this.cellStart.fill(0, 0, cells + 1);
    if (this.entries.length < count) this.entries = new Int32Array(count);
    // Pass 1: count per cell (offset +1 so prefix sum yields start offsets).
    for (let i = 0; i < count; i += 1) {
      this.cellStart[this.cellIndex(posX[i], posY[i]) + 1] += 1;
    }
    for (let c = 0; c < cells; c += 1) this.cellStart[c + 1] += this.cellStart[c];
    // Pass 2: scatter through a persistent cursor copy (no per-rebuild alloc).
    if (this.cursor.length < cells + 1) this.cursor = new Int32Array(cells + 1);
    this.cursor.set(this.cellStart.subarray(0, cells + 1));
    for (let i = 0; i < count; i += 1) {
      const c = this.cellIndex(posX[i], posY[i]);
      this.entries[this.cursor[c]] = i;
      this.cursor[c] += 1;
    }
  }

  private cellIndex(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.minY) / this.cell)));
    return cy * this.cols + cx;
  }

  /** Visit every node index whose cell intersects `view` (padded). */
  queryRect(view: WorldBounds, pad: number, visit: (i: number) => void): void {
    const c0 = Math.max(0, Math.floor((view.minX - pad - this.minX) / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor((view.maxX + pad - this.minX) / this.cell));
    const r0 = Math.max(0, Math.floor((view.minY - pad - this.minY) / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor((view.maxY + pad - this.minY) / this.cell));
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        const c = row * this.cols + col;
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k += 1) visit(this.entries[k]);
      }
    }
  }

  /** Visit node indices in the 3×3 cell neighborhood of a world point. */
  queryPoint(x: number, y: number, visit: (i: number) => void): void {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.minY) / this.cell)));
    for (let row = Math.max(0, cy - 1); row <= Math.min(this.rows - 1, cy + 1); row += 1) {
      for (let col = Math.max(0, cx - 1); col <= Math.min(this.cols - 1, cx + 1); col += 1) {
        const c = row * this.cols + col;
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k += 1) visit(this.entries[k]);
      }
    }
  }
}
