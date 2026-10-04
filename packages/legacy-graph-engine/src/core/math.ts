/**
 * Tiny pure math helpers shared across the engine. No dependencies, no DOM.
 */

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Stable, fast string hash (FNV-ish via Math.imul). Used for palette + seeds. */
export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + (value.codePointAt(index) ?? 0);
  }
  return Math.abs(hash);
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smoothstep easing on [0,1] — gentle ease-in-out for reveal/transition curves. */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}
