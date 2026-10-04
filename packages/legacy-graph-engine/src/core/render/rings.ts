/**
 * Ring overlays drawn in world space on top of nodes: a note-ring for nodes that
 * carry an overlay note, plus the hover/selected state rings. Kept separate so the
 * node pass stays a tight sprite-blit loop. Iterates the frame cull list, and note
 * rings hand off to the cards' own indicator at close zoom.
 *
 * State reads as TWO layers, not one stroke: a soft halo (a lit atmosphere that
 * fades out — emphasis that survives any backdrop) under a crisp ring (the actual
 * boundary). Hover is a breath; selection is unmistakable. Only ever 1–2 nodes carry
 * state per frame, so those gradients are free — the batched note-ring path below is
 * the one that has to stay cheap at 10k.
 */

import type { DrawCtx } from "./drawTypes";
import { lodMix } from "./lod";
import { normalizeRgb, rgba } from "../theme/shade";

const TAU = Math.PI * 2;

/** How a state reads: gap from the body, stroke weight, halo reach, halo strength. */
interface StateRing {
  offset: number;
  width: number;
  glow: number;
  alpha: number;
}

const HOVER: StateRing = { offset: 4, width: 2, glow: 9, alpha: 0.3 };
const SELECTED: StateRing = { offset: 5.5, width: 3.2, glow: 17, alpha: 0.5 };

export function drawRings(d: DrawCtx, hoverIndex: number, selectedIndex: number): void {
  const { ctx, state, theme, visual, camera, cull } = d;
  const scale = camera.scale;
  const mix = lodMix(scale, visual.semanticZoom);

  if (mix.card <= 0.6) {
    // One batched path for every note ring: dashes looked nice but software
    // rasterizers explode each dash into AA segments (hundreds of ms at 10k),
    // and per-node stroke() calls were nearly as bad. Solid + batched is flat.
    ctx.strokeStyle = theme.noteRing;
    ctx.lineWidth = 1.5 / scale;
    ctx.beginPath();
    for (let k = 0; k < cull.count; k += 1) {
      const i = cull.list[k];
      if (!state.hasNote[i]) continue;
      const r = state.radius[i] * visual.nodeScale + 3;
      ctx.moveTo(state.posX[i] + r, state.posY[i]);
      ctx.arc(state.posX[i], state.posY[i], r, 0, TAU);
    }
    ctx.stroke();
  }

  drawStateRing(d, hoverIndex, theme.hoverRing, HOVER);
  drawStateRing(d, selectedIndex, theme.selectRing, SELECTED);
}

/** Halo + crisp ring. The halo scales with the node, so a big hub reads as a big focus. */
function drawStateRing(d: DrawCtx, index: number, color: string, ring: StateRing): void {
  const { ctx, state, visual, camera } = d;
  if (index < 0 || index >= state.count || state.visible[index] === 0) return;

  const x = state.posX[index];
  const y = state.posY[index];
  const body = state.radius[index] * visual.nodeScale;
  const r = body + ring.offset;
  const outer = r + Math.max(ring.glow, body * 0.6);
  const tone = normalizeRgb(ctx, color);

  const halo = ctx.createRadialGradient(x, y, r, x, y, outer);
  halo.addColorStop(0, rgba(tone, ring.alpha * d.alpha));
  halo.addColorStop(1, rgba(tone, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, outer, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = ring.width / camera.scale;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}
