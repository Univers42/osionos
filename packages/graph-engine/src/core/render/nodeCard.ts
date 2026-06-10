/**
 * Close-zoom card pass — the third semantic-zoom stage. Each in-view node
 * becomes a small "glass card": icon chip, title, secondary line and a
 * link-count pill, drawn in WORLD space (cards pan/zoom naturally and canvas
 * text stays vector-crisp). Hard-capped per frame: if more candidates are in
 * view, the highest-degree nodes win and the rest stay sprites.
 */

import type { DrawCtx } from "./drawTypes";
import { nodeReveal } from "./reveal";
import { iconGlyph } from "./nodeIcon";
import { loadGlyphImage } from "./spriteIcons";
import { ellipsize } from "./cardText";

const CARD_W = 96;
const CARD_H = 32;
const RADIUS = 7;
const CHIP = 22;
const MAX_CARDS = 80;

const candidates: number[] = [];

/** Draw the card stage at `cardMix` (0..1] over the in-view node list. */
export function drawCards(
  d: DrawCtx,
  cardMix: number,
  hoverIndex: number,
  selectedIndex: number,
  focusOnly = false,
): void {
  const { ctx, state, cull } = d;
  candidates.length = 0;
  for (let k = 0; k < cull.count; k += 1) candidates.push(cull.list[k]);
  if (candidates.length > MAX_CARDS) {
    candidates.sort((a, b) => state.degree[b] - state.degree[a]);
    candidates.length = MAX_CARDS;
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (const i of candidates) {
    if (focusOnly && !(d.focus?.has(i) ?? false)) continue;
    const rv = nodeReveal(d.reveal, i, d.time);
    if (rv <= 0.001) continue;
    drawCard(d, i, cardMix * rv * d.alpha, i === hoverIndex, i === selectedIndex);
  }
  ctx.globalAlpha = 1;
}

function drawCard(d: DrawCtx, i: number, alpha: number, hovered: boolean, selected: boolean): void {
  const { ctx, state, theme } = d;
  const x = state.posX[i] - CARD_W / 2;
  const y = state.posY[i] - CARD_H / 2;
  ctx.globalAlpha = alpha;
  roundRect(ctx, x, y, CARD_W, CARD_H, RADIUS);
  ctx.fillStyle = theme.cardBg;
  ctx.fill();
  ctx.lineWidth = selected || hovered ? 1.6 : 1;
  ctx.strokeStyle = selected ? theme.selectRing : hovered ? theme.hoverRing : theme.cardBorder;
  ctx.stroke();
  cardChip(ctx, d, i, x + 5, y + (CARD_H - CHIP) / 2);

  const textX = x + 5 + CHIP + 5;
  const textW = CARD_W - 5 - CHIP - 5 - 16;
  ctx.font = "600 9.5px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = theme.cardTitle;
  ctx.fillText(ellipsize(ctx, state.labelText[i] ?? state.ids[i], textW), textX, y + 11);
  ctx.font = "8px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = theme.cardMuted;
  const secondary = state.databaseId[i] ?? state.source[i];
  ctx.fillText(ellipsize(ctx, secondary, textW), textX, y + 22.5);

  // Link-count pill at the right edge, stroked in the node color.
  const degree = String(state.degree[i]);
  ctx.font = "8.5px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = state.fills[i];
  ctx.fillText(degree, x + CARD_W - 6, y + 11);
  ctx.textAlign = "left";

  if (state.hasNote[i] === 1) {
    // Amber note dot in the card's top-right corner.
    ctx.fillStyle = theme.noteRing;
    ctx.beginPath();
    ctx.arc(x + CARD_W - 5, y + 5, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Icon chip: rounded square tinted with the node color, glyph on top. */
function cardChip(ctx: CanvasRenderingContext2D, d: DrawCtx, i: number, x: number, y: number): void {
  const { state } = d;
  roundRect(ctx, x, y, CHIP, CHIP, 5);
  ctx.save();
  ctx.globalAlpha *= 0.18;
  ctx.fillStyle = state.fills[i];
  ctx.fill();
  ctx.restore();
  const glyph = iconGlyph(state.icon[i], state.label[i]);
  ctx.textAlign = "center";
  if (glyph.kind === "image") {
    const img = loadGlyphImage(glyph.ref, () => undefined);
    if (img) {
      ctx.save();
      roundRect(ctx, x + 2, y + 2, CHIP - 4, CHIP - 4, 4);
      ctx.clip();
      ctx.drawImage(img, x + 2, y + 2, CHIP - 4, CHIP - 4);
      ctx.restore();
      ctx.textAlign = "left";
      return;
    }
  }
  if (glyph.kind === "emoji") {
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(glyph.ref, x + CHIP / 2, y + CHIP / 2 + 0.5);
  } else {
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = state.fills[i];
    ctx.fillText(glyph.kind === "monogram" ? glyph.ref : "•", x + CHIP / 2, y + CHIP / 2 + 0.5);
  }
  ctx.textAlign = "left";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
