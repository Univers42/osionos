/**
 * Overview level-of-detail. Zoomed out, the graph is a haze of sub-pixel dots and
 * drawing each one is O(nodes) for no visual gain. Instead collapse each database
 * island — grouped by `source`, the SAME key the layout clusters by — into ONE
 * translucent blob at its centroid, sized by the node spread, labelled with its
 * record count. The aggregates are cached on SceneState (recomputed only when
 * positions/visibility/colors change), so a settled overview pans at O(clusters):
 * 100k nodes cost about the same as 100.
 */

import type { Camera } from "../camera/transform";
import type { SceneTheme } from "../theme/tokens";
import type { ClusterBlob } from "./sceneState";

/** Overview LOD: below this camera scale, with a graph larger than AGG_MIN_NODES,
 *  render database blobs instead of individual nodes (and skip the frame-cull).
 *  Kept low so individual records (GPU-cheap) show through normal zoom; only the
 *  far survey view collapses to blobs. */
export const AGG_MAX_SCALE = 0.34;
/** Only collapse to blobs for genuinely large graphs — a normal graph (a few
 *  thousand nodes) renders every node at the overview, exactly as before. */
export const AGG_MIN_NODES = 15000;
/** Max individual nodes drawn per frame before collapsing to blobs — bounds the
 *  per-frame cost at any zoom so a dense mid-zoom view stays smooth at 44k+. */
export const NODE_BUDGET = 8000;

/** One translucent disc + core per database cluster, from pre-computed aggregates.
 *  Runs under the world transform (positions are world space). O(clusters). */
export function drawClusterBlobs(ctx: CanvasRenderingContext2D, blobs: ClusterBlob[], camera: Camera): void {
  const floor = 26 / camera.scale; // keep a minimum on-screen footprint
  for (const b of blobs) {
    const r = Math.max(floor, b.spread * 1.5 + floor);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = b.fill;
    ctx.beginPath();
    ctx.arc(b.mx, b.my, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(b.mx, b.my, Math.max(3 / camera.scale, r * 0.1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The record count per cluster, in screen space (crisp, unscaled). Call after the
 *  world transform is restored. */
export function drawClusterLabels(
  ctx: CanvasRenderingContext2D,
  blobs: ClusterBlob[],
  camera: Camera,
  theme: SceneTheme,
): void {
  if (blobs.length === 0) return;
  ctx.save();
  ctx.font = "600 13px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = theme.label;
  for (const b of blobs) {
    ctx.fillText(
      b.n.toLocaleString(),
      camera.x + b.mx * camera.scale,
      camera.y + b.my * camera.scale,
    );
  }
  ctx.restore();
}
