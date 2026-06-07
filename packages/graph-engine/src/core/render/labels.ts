/**
 * Label pass, drawn in SCREEN space (after the world transform is restored) so
 * text stays crisp at any zoom. Level-of-detail: accent labels (selected / hovered
 * / focused) always show; the rest appear past a zoom threshold and within a
 * budget — both governed by the console's label-density slider.
 */

import { lerp } from "../math";
import { worldToScreen } from "../camera/transform";
import type { DrawCtx } from "./drawTypes";
import { nodeInView } from "./cull";

export function drawLabels(
  d: DrawCtx,
  focus: ReadonlySet<number> | null,
  hoverIndex: number,
  selectedIndex: number,
): void {
  const { ctx, state, view, camera, theme, visual } = d;
  const minScale = lerp(2, 0.75, visual.labelDensity);
  const showAll = camera.scale >= minScale;
  let budget = Math.round(60 + visual.labelDensity * 420);

  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";

  for (let i = 0; i < state.count; i += 1) {
    if (!nodeInView(state, i, view, visual.nodeScale * 2.2)) continue;
    const accent = i === selectedIndex || i === hoverIndex || (focus?.has(i) ?? false);
    if (!accent) {
      if (!showAll || budget <= 0) continue;
      budget -= 1;
    }
    drawLabel(ctx, theme.label, theme.labelHalo, state.labelText[i] ?? state.ids[i], i, d);
  }
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  color: string,
  halo: string,
  text: string,
  index: number,
  d: DrawCtx,
): void {
  const { state, camera, visual } = d;
  const screen = worldToScreen(camera, state.posX[index], state.posY[index]);
  const x = screen.x + state.radius[index] * visual.nodeScale * camera.scale + 5;
  const width = ctx.measureText(text).width;
  ctx.fillStyle = halo;
  ctx.fillRect(x - 3, screen.y - 8, width + 6, 16);
  ctx.fillStyle = color;
  ctx.fillText(text, x, screen.y);
}
