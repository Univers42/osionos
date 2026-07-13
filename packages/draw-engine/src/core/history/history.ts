/**
 * A bounded undo/redo stack over immutable snapshots. Pushing a snapshot equal to
 * the current one (by `signature`) is a no-op, so redundant commits don't create
 * empty undo steps. Pure + node-tested; the engine snapshots the scene into it.
 */

export class SnapshotHistory<T> {
  private stack: T[];
  private index = 0;
  // Explicit fields (no constructor parameter properties — the --experimental-
  // strip-types canvas runner cannot strip those).
  private readonly signature: (value: T) => string;
  private readonly limit: number;

  constructor(initial: T, signature: (value: T) => string, limit = 200) {
    this.stack = [initial];
    this.signature = signature;
    this.limit = limit;
  }

  /** Record `value` as a new step; skipped when it matches the current step. */
  push(value: T): void {
    if (this.signature(value) === this.signature(this.stack[this.index])) return;
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(value);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  /** Step back one snapshot, or null at the beginning. */
  undo(): T | null {
    if (this.index <= 0) return null;
    this.index -= 1;
    return this.stack[this.index];
  }

  /** Step forward one snapshot, or null at the end. */
  redo(): T | null {
    if (this.index >= this.stack.length - 1) return null;
    this.index += 1;
    return this.stack[this.index];
  }

  /** Discard all history and start fresh from `value`. */
  reset(value: T): void {
    this.stack = [value];
    this.index = 0;
  }
}
