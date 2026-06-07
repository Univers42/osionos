/**
 * Initial reveal animation: nodes fade + scale in with a center-out stagger, so
 * the graph "blooms" on first paint instead of snapping in. Pure math — the scene
 * keeps redrawing while `isRevealing` is true. Honors reduced-motion (disabled →
 * everything is instantly at full size).
 */

import { smoothstep } from "../math";

export interface RevealState {
  start: number;
  durationMs: number;
  /** Window over which node start-times are spread (≤ durationMs). */
  staggerMs: number;
  count: number;
  enabled: boolean;
}

export function startReveal(enabled: boolean, count: number, now: number): RevealState {
  return { start: now, durationMs: 820, staggerMs: 420, count, enabled };
}

/** Per-node reveal factor (alpha == scale), 0→1. */
export function nodeReveal(state: RevealState, index: number, now: number): number {
  if (!state.enabled) return 1;
  const span = Math.max(1, state.count - 1);
  const delay = (index / span) * state.staggerMs;
  const nodeDur = state.durationMs - state.staggerMs;
  return smoothstep((now - state.start - delay) / nodeDur);
}

/** Links fade in as a group after most nodes have appeared. */
export function linkReveal(state: RevealState, now: number): number {
  if (!state.enabled) return 1;
  return smoothstep((now - state.start - state.staggerMs * 0.6) / (state.durationMs * 0.6));
}

export function isRevealing(state: RevealState, now: number): boolean {
  return state.enabled && now - state.start < state.durationMs;
}
