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
}

// TEMP instrumentation (removed before commit): per-pass timings on demand.
const PROFILE = typeof globalThis !== "undefined" && "___graphProfile" in globalThis;
const mark = (tag: string, t0: number): void => {
  if (!PROFILE) return;
  const bag = ((globalThis as Record<string, unknown>).___graphTimes ??= {}) as Record<string, number>;
  bag[tag] = (bag[tag] ?? 0) + (performance.now() - t0);
  bag.frames = tag === "labels" ? (bag.frames ?? 0) + 1 : (bag.frames ?? 0);
};

export function renderFrame(f: FrameInput): void {
  const { ctx, camera } = f;
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  ctx.clearRect(0, 0, f.width, f.height);

  let t = performance.now();
  const view = visibleWorldRect(camera, f.width, f.height);
  const cull = frameCull(f.state, view, f.visual.nodeScale);
  mark("cull", t);
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

  if (f.focus) {
    const dim: DrawCtx = { ...base, alpha: f.theme.dimAlpha };
    drawLinks(dim);
    drawNodes(dim, f.sprites);
    if (mix.card > 0.001) drawCards(dim, mix.card, f.hoverIndex, f.selectedIndex);
    drawGlow(base, f.hoverIndex, f.selectedIndex);
    drawLinks(base, true);
    drawEdgeFlow(base, f.selectedIndex, false);
    if (f.hoverIndex !== f.selectedIndex) drawEdgeFlow(base, f.hoverIndex, true);
    drawNodes(base, f.sprites, true);
    if (mix.card > 0.001) drawCards(base, mix.card, f.hoverIndex, f.selectedIndex, true);
  } else {
    let t2 = performance.now();
    drawLinks(base);
    mark("links", t2);
    drawEdgeFlow(base, f.selectedIndex, false);
    if (f.hoverIndex !== f.selectedIndex) drawEdgeFlow(base, f.hoverIndex, true);
    t2 = performance.now();
    drawGlow(base, f.hoverIndex, f.selectedIndex);
    mark("glow", t2);
    t2 = performance.now();
    drawNodes(base, f.sprites);
    mark("nodes", t2);
    t2 = performance.now();
    if (mix.card > 0.001) drawCards(base, mix.card, f.hoverIndex, f.selectedIndex);
    mark("cards", t2);
  }
  if (mix.card <= 0.6) drawHubArcs(base);
  // Raise the hovered + selected node above any overlap, then ring them on top.
  drawNodeSprite(base, f.sprites, f.selectedIndex);
  if (f.hoverIndex !== f.selectedIndex) drawNodeSprite(base, f.sprites, f.hoverIndex);
  t = performance.now();
  drawRings(base, f.hoverIndex, f.selectedIndex);
  mark("rings", t);
  ctx.restore();

  t = performance.now();
  drawLabels(base, f.labels, f.focus, f.hoverIndex, f.selectedIndex, f.hoverNeighbors, f.hoverFade);
  mark("labels", t);
}
