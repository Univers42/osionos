/**
 * Tunable force-simulation parameters, surfaced to the console's Physics panel so
 * the layout can be reshaped live (charge/repulsion, link distance & strength,
 * collision spacing, center gravity, damping). Defaults reproduce the original
 * Second Brain feel.
 */

export interface LayoutParams {
  /** Many-body repulsion (negative = repel). */
  chargeStrength: number;
  /** Max distance the charge force acts over (perf knob). */
  chargeDistanceMax: number;
  /** Base link distance; per-link distance = linkDistance / max(0.4, strength). */
  linkDistance: number;
  /** Per-link pull scale; per-link strength = min(0.7, scale * strength). */
  linkStrengthScale: number;
  /** Collision radius (node spacing). */
  collideRadius: number;
  /** Center-gravity strength (0 = free drift, 1 = strong pull to center). */
  centerStrength: number;
  /** Velocity damping (higher = settles faster, less springy). */
  velocityDecay: number;
}

export const DEFAULT_LAYOUT_PARAMS: LayoutParams = {
  chargeStrength: -90,
  chargeDistanceMax: 520,
  linkDistance: 60,
  linkStrengthScale: 0.15,
  collideRadius: 16,
  centerStrength: 1,
  velocityDecay: 0.42,
};
