/**
 * Link-thickness tiers: relationship `strength` is quantized into a few width
 * tiers so edges can read "thicker = stronger" while still being drawn as a
 * handful of batched paths (one stroke per bucket×tier) instead of one stroke per
 * edge — keeping tens of thousands of links fast.
 */

import type { EdgeBucketId } from "./sceneState";

export const TIERS = 4;

/** Map a strength (~0..3+) to a tier 0..3. */
export function strengthTier(strength: number): number {
  if (strength >= 2) return 3;
  if (strength >= 1.2) return 2;
  if (strength >= 0.6) return 1;
  return 0;
}

const BASE_WIDTH: Record<EdgeBucketId, number> = { 0: 1.1, 1: 0.7, 2: 1.0, 3: 2.0 };

/** World-space stroke width for a bucket+tier, scaled by the console's linkScale. */
export function tierWidth(bucket: EdgeBucketId, tier: number, linkScale: number): number {
  return (BASE_WIDTH[bucket] + tier * 0.65) * linkScale;
}
