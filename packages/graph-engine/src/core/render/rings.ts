/**
 * Ring overlays drawn in world space on top of nodes: a soft note-ring for nodes
 * that carry an overlay note, plus accent rings for the hovered and selected
 * nodes. Kept separate so the node pass stays a tight sprite-blit loop.
 */

import type { DrawCtx } from "./drawTypes";

export function drawRings(d: DrawCtx, hoverIndex: number, selectedIndex: number): void {
  const { ctx, state, theme, visual, camera } = d;
  const scale = camera.scale;

  ctx.strokeStyle = theme.noteRing;
  ctx.lineWidth = 1.5 / scale;
  for (let i = 0; i < state.count; i += 1) {
    if (!state.hasNote[i] || state.visible[i] === 0) continue;
    const r = state.radius[i] * visual.nodeScale + 3;
    ctx.beginPath();
    ctx.arc(state.posX[i], state.posY[i], r, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawAccentRing(d, hoverIndex, theme.hoverRing, 2.4, 4);
  drawAccentRing(d, selectedIndex, theme.selectRing, 3.4, 5.5);
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
