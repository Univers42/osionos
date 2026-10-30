// Draws one frame of the sign-in globe on a 2D canvas, back to front: the lit disc, the dust
// skin, engraved meridians, the links along the surface, the nodes, the pulses travelling the
// links, then the hub labels facing the viewer. Colours come in resolved (the loop reads them
// from the --osio-* tokens), so the globe follows the active palette and theme.

import { projectPoint, silhouetteRadius, type GlobeModel, type NodeKind, type Projected, type Vec3 } from "./globeModel";

export interface GlobeColors {
  ink: string;
  accent: string;
  success: string;
  line: string;
  muted: string;
  paper: string;
  glow: string;
}

export interface Pulse {
  edge: number;
  /** Progress along the edge, 0 to 1. */
  t: number;
}

export interface GlobeFrame {
  yaw: number;
  pitch: number;
  /** Entrance progress, 0 (gathering) to 1 (settled). */
  entrance: number;
  width: number;
  height: number;
  dpr: number;
  labelFont: string;
  pulses: readonly Pulse[];
}

type Place = (p: Vec3) => Projected;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;

// Caveat: segment alpha is quantised to BUCKETS levels so a layer costs a few strokes, not one
// per segment; a segment's fade is off by at most 1/(2*BUCKETS) of its range, below what shows.
const BUCKETS = 6;
const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);

/** Stroke polylines with alpha = (lo + span * depth²) * fade, the back half a ghost. */
function strokeByDepth(ctx: CanvasRenderingContext2D, lines: readonly Vec3[][], place: Place, lo: number, span: number, fade: number) {
  for (const b of buckets) b.length = 0;
  for (const line of lines) {
    let prev = place(line[0]);
    for (let i = 1; i < line.length; i++) {
      const next = place(line[i]);
      const depth = (prev.depth + next.depth) / 2;
      buckets[Math.min(BUCKETS - 1, Math.floor(depth * depth * BUCKETS))].push(prev.sx, prev.sy, next.sx, next.sy);
      prev = next;
    }
  }
  buckets.forEach((segs, b) => {
    if (!segs.length) return;
    ctx.globalAlpha = (lo + (span * (b + 0.5)) / BUCKETS) * fade;
    ctx.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      ctx.moveTo(segs[i], segs[i + 1]);
      ctx.lineTo(segs[i + 2], segs[i + 3]);
    }
    ctx.stroke();
  });
}

function drawDisc(ctx: CanvasRenderingContext2D, colors: GlobeColors, cx: number, cy: number, r: number, fade: number) {
  const light = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.32, 0, cx, cy, r);
  light.addColorStop(0, colors.glow);
  light.addColorStop(0.62, colors.paper);
  light.addColorStop(1, colors.line);
  ctx.globalAlpha = 0.7 * fade;
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.5 * fade;
  ctx.strokeStyle = colors.line;
  ctx.stroke();
}

function drawDust(ctx: CanvasRenderingContext2D, dust: readonly Vec3[], place: Place, color: string, fade: number) {
  ctx.fillStyle = color;
  for (const front of [false, true]) {
    ctx.globalAlpha = (front ? 0.5 : 0.12) * fade;
    ctx.beginPath();
    for (const p of dust) {
      const s = place(p);
      if ((s.depth >= 0.5) === front) ctx.rect(s.sx - 0.6, s.sy - 0.6, 1.2 * s.scale, 1.2 * s.scale);
    }
    ctx.fill();
  }
}

function kindColor(kind: NodeKind, colors: GlobeColors): string {
  if (kind === "database") return colors.accent;
  return kind === "conversation" ? colors.success : colors.ink;
}

function drawNodes(ctx: CanvasRenderingContext2D, model: GlobeModel, points: Projected[], colors: GlobeColors, fade: number) {
  const order = points.map((_, i) => i).sort((a, b) => points[a].depth - points[b].depth);
  for (const i of order) {
    const node = model.nodes[i];
    const p = points[i];
    const alpha = (0.15 + 0.85 * p.depth * p.depth) * fade;
    const radius = (node.hub ? 3.6 : 1.2 + (i % 3) * 0.5) * p.scale;
    ctx.fillStyle = kindColor(node.kind, colors);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2);
    ctx.fill();
    if (!node.hub) continue;
    ctx.globalAlpha = alpha * 0.12;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, radius * 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, radius + 3.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function pointOnPath(path: readonly Vec3[], t: number): Vec3 {
  const at = clamp01(t) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(at));
  const f = at - i;
  const [a, b] = [path[i], path[i + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function drawPulses(ctx: CanvasRenderingContext2D, model: GlobeModel, pulses: readonly Pulse[], place: Place, color: string, fade: number) {
  ctx.fillStyle = color;
  for (const pulse of pulses) {
    const s = place(pointOnPath(model.paths[pulse.edge], pulse.t));
    // In, travel, out: a pulse never pops into being or out of it mid-link.
    const life = Math.sin(Math.PI * pulse.t) * clamp01((s.depth - 0.35) / 0.4) * fade;
    if (life <= 0) continue;
    ctx.globalAlpha = life * 0.22;
    ctx.beginPath();
    ctx.arc(s.sx, s.sy, 7 * s.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = life;
    ctx.beginPath();
    ctx.arc(s.sx, s.sy, 2 * s.scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLabels(ctx: CanvasRenderingContext2D, model: GlobeModel, points: Projected[], colors: GlobeColors, f: GlobeFrame, fade: number) {
  ctx.font = f.labelFont;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = colors.paper;
  ctx.fillStyle = colors.ink;
  model.nodes.forEach((node, i) => {
    const p = points[i];
    // Only labels on the visible face: a name drifting across the back reads as noise.
    if (!node.label || p.depth < 0.62) return;
    ctx.globalAlpha = clamp01((p.depth - 0.62) / 0.25) * fade;
    // Open outward, away from the crowded middle of the globe and toward the empty paper.
    const outward = p.sx < f.width / 2 ? -1 : 1;
    ctx.textAlign = outward < 0 ? "right" : "left";
    const x = p.sx + outward * 13 * p.scale;
    ctx.strokeText(node.label, x, p.sy);
    ctx.fillText(node.label, x, p.sy);
  });
}

export function drawGlobe(ctx: CanvasRenderingContext2D, model: GlobeModel, rings: Vec3[][], colors: GlobeColors, f: GlobeFrame) {
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  ctx.clearRect(0, 0, f.width, f.height);
  const radius = Math.min(f.width, f.height) * 0.36;
  const [cx, cy] = [f.width / 2, f.height / 2];
  const settle = easeOut(f.entrance);
  const place: Place = (p) => projectPoint(p, f.yaw, f.pitch, radius, cx, cy);
  const points = model.nodes.map((n) =>
    place([n.from[0] + (n.x - n.from[0]) * settle, n.from[1] + (n.y - n.from[1]) * settle, n.from[2] + (n.z - n.from[2]) * settle]),
  );
  drawDisc(ctx, colors, cx, cy, silhouetteRadius(radius), settle);
  drawDust(ctx, model.dust, place, colors.muted, settle);
  ctx.lineWidth = 1;
  ctx.strokeStyle = colors.line;
  strokeByDepth(ctx, rings, place, 0.06, 0.5, settle);
  // Links arrive once the nodes have gathered (their paths are drawn from the settled spots).
  const linked = clamp01((f.entrance - 0.65) / 0.35);
  ctx.strokeStyle = colors.muted;
  strokeByDepth(ctx, model.paths, place, 0.05, 0.55, linked);
  drawNodes(ctx, model, points, colors, clamp01(f.entrance * 1.6));
  drawPulses(ctx, model, f.pulses, place, colors.accent, linked);
  drawLabels(ctx, model, points, colors, f, clamp01((f.entrance - 0.75) / 0.25));
  ctx.globalAlpha = 1;
}
