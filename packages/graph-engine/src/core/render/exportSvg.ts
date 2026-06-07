/**
 * Render the current scene to a standalone SVG string (vector export). Walks the
 * same columnar state as the canvas renderer but emits `<line>`/`<circle>`/`<text>`
 * in world coordinates, framed to the visible bounds. Glow is omitted (SVG filters
 * would bloat the file); thickness/color still track strength + kind.
 */

import type { SceneTheme } from "../theme/tokens";
import type { VisualState } from "../state/controls";
import type { EdgeBucketId, SceneState } from "./sceneState";
import { TIERS, tierWidth } from "./tiers";

export function sceneToSvg(state: SceneState, theme: SceneTheme, visual: VisualState): string {
  const bounds = state.worldBounds();
  if (!bounds) return `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`;
  const pad = 48;
  const x = bounds.minX - pad;
  const y = bounds.minY - pad;
  const w = bounds.maxX - bounds.minX + pad * 2;
  const h = bounds.maxY - bounds.minY + pad * 2;

  const edges: string[] = [];
  for (let bucket = 0 as EdgeBucketId; bucket < 4; bucket = (bucket + 1) as EdgeBucketId) {
    for (let tier = 0; tier < TIERS; tier += 1) {
      const group = state.edgeGroups[bucket * TIERS + tier];
      if (!group) continue;
      const stroke = edgeColor(theme, bucket);
      const width = tierWidth(bucket, tier, visual.linkScale).toFixed(2);
      for (const e of group) {
        const a = state.edgeFrom[e];
        const b = state.edgeTo[e];
        if (state.visible[a] === 0 || state.visible[b] === 0) continue;
        edges.push(
          `<line x1="${f(state.posX[a])}" y1="${f(state.posY[a])}" x2="${f(state.posX[b])}" y2="${f(state.posY[b])}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`,
        );
      }
    }
  }

  const nodes: string[] = [];
  for (let i = 0; i < state.count; i += 1) {
    if (state.visible[i] === 0) continue;
    const r = (state.radius[i] * visual.nodeScale).toFixed(2);
    nodes.push(`<circle cx="${f(state.posX[i])}" cy="${f(state.posY[i])}" r="${r}" fill="${state.fills[i]}"/>`);
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}">`,
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${theme.bgBottom}"/>`,
    `<g opacity="0.85">${edges.join("")}</g>`,
    `<g>${nodes.join("")}</g>`,
    `</svg>`,
  ].join("");
}

function edgeColor(theme: SceneTheme, bucket: EdgeBucketId): string {
  if (bucket === 1) return theme.edgeTag;
  if (bucket === 2) return theme.edgeNote;
  if (bucket === 3) return theme.edgeHierarchy;
  return theme.edge;
}

function f(value: number): string {
  return value.toFixed(1);
}
