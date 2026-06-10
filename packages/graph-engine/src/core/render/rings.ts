/**
 * Ring overlays drawn in world space on top of nodes: a dotted note-ring for
 * nodes that carry an overlay note, plus accent rings for the hovered and
 * selected nodes (selection gains a faint secondary halo ring). Kept separate
 * so the node pass stays a tight sprite-blit loop. Iterates the frame cull
 * list, and note rings hand off to the cards' own indicator at close zoom.
 */

import type { DrawCtx } from "./drawTypes";
import { lodMix } from "./lod";

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
      ctx.arc(state.posX[i], state.posY[i], r, 0, Math.PI * 2);
    }
    ctx.stroke();
  }

  drawAccentRing(d, hoverIndex, theme.hoverRing, 2.4, 5);
  drawAccentRing(d, selectedIndex, theme.selectRing, 3.4, 5.5);
  if (selectedIndex >= 0) {
    // Faint secondary halo gives the selection a calm, deliberate emphasis.
    ctx.save();
    ctx.globalAlpha = 0.25 * d.alpha;
    drawAccentRing(d, selectedIndex, theme.selectRing, 1.4, 9);
    ctx.restore();
  }
}

function drawAccentRing(d: DrawCtx, index: number, color: string, width: number, offset: number): void {
  const { ctx, state, visual, camera } = d;
  if (index < 0 || index >= state.count || state.visible[index] === 0) return;
  const r = state.radius[index] * visual.nodeScale + offset;
  ctx.strokeStyle = color;
  ctx.lineWidth = width / camera.scale;
  ctx.beginPath();
  ctx.arc(state.posX[index], state.posY[index], r, 0, Math.PI * 2);
  ctx.stroke();
}
