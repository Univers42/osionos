/**
 * Transient interaction effects state, kept out of the scene orchestrator:
 * the hovered node's neighbor set (CSR walk, O(degree)) for label fade-in,
 * and the animation keep-alive that drives the edge energy-flow drift. Only
 * an ACTIVE hover animates — selection alone never burns RAF frames.
 */

import type { SceneState } from "./sceneState";

const LABEL_FADE_MS = 180;

export class SceneFx {
  hoverIndex = -1;
  hoverChangedAt = 0;
  readonly neighbors = new Set<number>();

  /** Recompute the neighbor set when the hovered node changes. */
  setHover(index: number, state: SceneState, now: number): void {
    if (index === this.hoverIndex) return;
    this.hoverIndex = index;
    this.hoverChangedAt = now;
    this.neighbors.clear();
    if (index < 0) return;
    const { nodeEdgeOffsets, nodeEdgeList, edgeFrom, edgeTo } = state.edges;
    for (let k = nodeEdgeOffsets[index]; k < nodeEdgeOffsets[index + 1]; k += 1) {
      const e = nodeEdgeList[k];
      const other = edgeFrom[e] === index ? edgeTo[e] : edgeFrom[e];
      this.neighbors.add(other);
    }
  }

  /** Should the scene keep scheduling frames for hover effects? */
  animating(now: number, reducedMotion: boolean): boolean {
    if (this.hoverIndex < 0) return now - this.hoverChangedAt < LABEL_FADE_MS && !reducedMotion;
    return !reducedMotion; // dash drift runs while a node is hovered
  }

  /** 0..1 fade progress for neighbor labels since the last hover change. */
  labelFade(now: number, reducedMotion: boolean): number {
    if (reducedMotion) return 1;
    return Math.min(1, (now - this.hoverChangedAt) / LABEL_FADE_MS);
  }
}
