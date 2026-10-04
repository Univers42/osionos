/**
 * Compose one frame: clear, frame-cull once, draw links + nodes (+ the
 * semantic-zoom card stage) under the world transform — with a dim base pass +
 * a full focus pass when a neighborhood is focused — overlay rings, then blit
 * labels in screen space. Pulled out of the scene class so the orchestrator
 * stays small; every pass lives in its own module.
 */

import { visibleWorldRect } from "../camera/controls";
import type { Camera } from "../camera/transform";
import type { SceneTheme } from "../theme/tokens";
import type { VisualState } from "../state/controls";
import type { RevealState } from "./reveal";
import type { SceneState } from "./sceneState";
import type { NodeSpriteCache } from "./sprites";
import type { LabelCache } from "./labelCache";
import type { DrawCtx } from "./drawTypes";
import { frameCull } from "./cull";
import { lodMix } from "./lod";
import { AGG_MAX_SCALE, AGG_MIN_NODES, drawClusterBlobs, drawClusterLabels } from "./clusterBlobs";
import { drawLinks } from "./links";
import { drawEdgeFlow } from "./edgeFlow";
import { drawGlow } from "./glowPass";
import { drawNodes, drawNodeSprite } from "./nodes";
import { drawHubArcs } from "./hubArc";
import { drawCards } from "./nodeCard";
import { drawRings } from "./rings";
import { drawLabels } from "./labels";

export interface FrameInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  camera: Camera;
  theme: SceneTheme;
  visual: VisualState;
  state: SceneState;
  sprites: NodeSpriteCache;
  labels: LabelCache;
  reveal: RevealState;
  time: number;
  focus: ReadonlySet<number> | null;
  hoverIndex: number;
  selectedIndex: number;
  /** Neighbor set of the hovered node (label fade-in + flow targets). */
  hoverNeighbors: ReadonlySet<number> | null;
  /** 0..1 fade progress for neighbor labels since the hover changed. */
  hoverFade: number;
  reducedMotion: boolean;
  /** Motion frame (pan/zoom/layout): skip decorative passes + labels so it stays smooth. */
  lowQuality: boolean;
}

export function renderFrame(f: FrameInput): void {
  const { ctx, camera } = f;
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  ctx.clearRect(0, 0, f.width, f.height);

  const view = visibleWorldRect(camera, f.width, f.height);

  // Overview LOD: the far-survey view collapses to ~one disc per database
  // (O(clusters), cached) and skips the O(n) frame-cull + per-node/edge passes.
  // Closer in, individual nodes draw but are capped to a budget (see drawNodes).
  if (!f.focus && camera.scale < AGG_MAX_SCALE && f.state.count > AGG_MIN_NODES) {
    // Recompute aggregates only when the view is still; reuse during pan/settle.
    const blobs = f.state.clusterAggregates(!f.lowQuality);
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.scale, camera.scale);
    drawClusterBlobs(ctx, blobs, camera);
    ctx.restore();
    drawClusterLabels(ctx, blobs, camera, f.theme);
    return;
  }

  const cull = frameCull(f.state, view, f.visual.nodeScale);
  const mix = lodMix(camera.scale, f.visual.semanticZoom);
  const base: DrawCtx = {
    ctx,
    state: f.state,
    view,
    camera,
    theme: f.theme,
    visual: f.visual,
    time: f.time,
    reveal: f.reveal,
    alpha: 1,
    focus: f.focus,
    reducedMotion: f.reducedMotion,
    cull,
  };

  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);

  const lq = f.lowQuality;
  if (f.focus) {
    const dim: DrawCtx = { ...base, alpha: f.theme.dimAlpha };
    drawLinks(dim);
    drawNodes(dim, f.sprites);
    if (!lq && mix.card > 0.001) drawCards(dim, mix.card, f.hoverIndex, f.selectedIndex);
    if (!lq) drawGlow(base, f.hoverIndex, f.selectedIndex);
    drawLinks(base, true);
    if (!lq) {
      drawEdgeFlow(base, f.selectedIndex, false);
      if (f.hoverIndex !== f.selectedIndex) drawEdgeFlow(base, f.hoverIndex, true);
    }
    drawNodes(base, f.sprites, true);
    if (!lq && mix.card > 0.001) drawCards(base, mix.card, f.hoverIndex, f.selectedIndex, true);
  } else {
    // ponytail: on a large graph, a motion (zoom/pan) frame that has zoomed in past the
    // density gate would iterate every edge — O(edges) with drawArrows, the measured 100k
    // zoom hotspot (2fps). Edges are an unreadable moving hairball mid-zoom, so defer the
    // full edge pass to the settled frame (lq=false), matching the decorative-pass policy
    // above. Smaller graphs keep edges during motion (cheap). Fixed at count > AGG_MIN_NODES.
    if (!lq || f.state.count <= AGG_MIN_NODES) drawLinks(base);
    if (!lq) {
      drawEdgeFlow(base, f.selectedIndex, false);
      if (f.hoverIndex !== f.selectedIndex) drawEdgeFlow(base, f.hoverIndex, true);
      drawGlow(base, f.hoverIndex, f.selectedIndex);
    }
    drawNodes(base, f.sprites);
    if (!lq && mix.card > 0.001) drawCards(base, mix.card, f.hoverIndex, f.selectedIndex);
  }
  if (!lq && mix.card <= 0.6) drawHubArcs(base);
  // Raise the hovered + selected node above any overlap, then ring them on top.
  drawNodeSprite(base, f.sprites, f.selectedIndex);
  if (f.hoverIndex !== f.selectedIndex) drawNodeSprite(base, f.sprites, f.hoverIndex);
  drawRings(base, f.hoverIndex, f.selectedIndex);
  ctx.restore();

  if (!lq) drawLabels(base, f.labels, f.focus, f.hoverIndex, f.selectedIndex, f.hoverNeighbors, f.hoverFade);
}
