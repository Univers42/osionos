/**
 * Tiny pure math helpers shared across the draw engine. No dependencies, no DOM.
 * (Lifted from @osionos/graph-engine — same primitives, one copy per package to
 * keep the core self-contained and the import firewall clean.)
 */

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smoothstep easing on [0,1] — gentle ease-in-out. */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Stable, fast string hash (FNV-ish via Math.imul). Used for element seeds. */
export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + (value.codePointAt(index) ?? 0);
  }
  return Math.abs(hash);
}

/** Round to a whole device pixel to keep 1px strokes crisp. */
export function roundPx(value: number): number {
  return Math.round(value);
}
