/**
 * Link pass: edges drawn thicker when their relationship is stronger (quantized
 * tiers, batched as one stroke per bucket×tier), colored by kind, with animated
 * dashes for tag/note edges and arrowheads for directed edges at high zoom. Links
 * fade in as a group during the reveal.
 */

import type { DrawCtx } from "./drawTypes";
import { ARROW_MIN_SCALE, TAG_EDGE_MIN_SCALE } from "./drawTypes";
import type { EdgeBucketId } from "./sceneState";
import { NODE_BUDGET } from "./clusterBlobs";
import { segmentInView } from "./cull";
import { linkReveal } from "./reveal";
import { TIERS, tierWidth } from "./tiers";
import type { SceneTheme } from "../theme/tokens";

const DRAW_ORDER: EdgeBucketId[] = [0, 2, 3, 1];
// Skip the (tens of thousands of) edges when the view is far out OR dense (more
// nodes in view than the draw budget) — a sub-pixel hairball whose per-frame
// iteration is a major cost and which isn't legible at that density. Edges resolve
// once you zoom into a region (< budget nodes). Hover-focus always draws (focusOnly).
const EDGE_LOD_MIN_SCALE = 0.3;

export function drawLinks(d: DrawCtx, focusOnly = false): void {
  const { ctx, state, view, camera, theme, visual, time, cull } = d;
  const scale = camera.scale;
  const alpha = linkReveal(d.reveal, time) * d.alpha;
  if (alpha <= 0.001) return;
  if (!focusOnly && (scale < EDGE_LOD_MIN_SCALE || cull.count > NODE_BUDGET)) return;
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";

  for (const bucket of DRAW_ORDER) {
    if (bucket === 1 && scale < TAG_EDGE_MIN_SCALE) continue;
    const dashed = bucket === 1 || bucket === 2;
    if (dashed) {
      ctx.setLineDash([7 / scale, 5 / scale]);
      ctx.lineDashOffset = (-time * 0.018) / scale;
    } else {
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = bucketColor(theme, bucket);
    for (let tier = 0; tier < TIERS; tier += 1) {
      const group = state.edgeGroups[bucket * TIERS + tier];
      if (!group || group.length === 0) continue;
      ctx.lineWidth = tierWidth(bucket, tier, visual.linkScale) / scale;
      ctx.beginPath();
      let drew = false;
      for (const e of group) {
        const a = state.edgeFrom[e];
        const b = state.edgeTo[e];
        if (state.visible[a] === 0 || state.visible[b] === 0) continue;
        if (focusOnly && !((d.focus?.has(a) ?? false) && (d.focus?.has(b) ?? false))) continue;
        if (!segmentInView(state, a, b, view)) continue;
        ctx.moveTo(state.posX[a], state.posY[a]);
        ctx.lineTo(state.posX[b], state.posY[b]);
        drew = true;
      }
      if (drew) ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  if (scale >= ARROW_MIN_SCALE) drawArrows(d);
}

function drawArrows(d: DrawCtx): void {
  const { ctx, state, view, camera, theme } = d;
  const size = 7 / camera.scale;
  ctx.fillStyle = theme.edge;
  for (let e = 0; e < state.edgeDirected.length; e += 1) {
    if (state.edgeDirected[e] === 0) continue;
    const a = state.edgeFrom[e];
    const b = state.edgeTo[e];
    if (state.visible[a] === 0 || state.visible[b] === 0) continue;
    if (!segmentInView(state, a, b, view)) continue;
    const ax = state.posX[a];
    const ay = state.posY[a];
    const bx = state.posX[b];
    const by = state.posY[b];
    const angle = Math.atan2(by - ay, bx - ax);
    const tipX = bx - Math.cos(angle) * (state.radius[b] + 1);
    const tipY = by - Math.sin(angle) * (state.radius[b] + 1);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(angle - 0.4) * size, tipY - Math.sin(angle - 0.4) * size);
    ctx.lineTo(tipX - Math.cos(angle + 0.4) * size, tipY - Math.sin(angle + 0.4) * size);
    ctx.closePath();
    ctx.fill();
  }
}

function bucketColor(theme: SceneTheme, bucket: EdgeBucketId): string {
  if (bucket === 1) return theme.edgeTag;
  if (bucket === 2) return theme.edgeNote;
  if (bucket === 3) return theme.edgeHierarchy;
  return theme.edge;
}
