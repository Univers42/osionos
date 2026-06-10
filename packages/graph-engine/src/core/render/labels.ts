/**
 * Label pass, drawn in SCREEN space (after the world transform is restored) so
 * text stays crisp at any zoom. Level-of-detail: accent labels (selected /
 * hovered / focused / hubs) always show; the rest appear past a zoom threshold
 * and within a budget — both governed by the console's label-density slider.
 * Labels blit from the pre-baked LabelCache (the old per-frame shadowBlur
 * fillText was the dominant frame cost at 10k nodes), and non-accent labels
 * hand off to the cards once the card stage is mostly in.
 */

import { lerp } from "../math";
import { worldToScreen } from "../camera/transform";
import type { DrawCtx } from "./drawTypes";
import type { LabelCache } from "./labelCache";
import { lodMix } from "./lod";

export function drawLabels(
  d: DrawCtx,
  cache: LabelCache,
  focus: ReadonlySet<number> | null,
  hoverIndex: number,
  selectedIndex: number,
  hoverNeighbors: ReadonlySet<number> | null = null,
  hoverFade = 1,
): void {
  const { ctx, state, camera, visual, cull } = d;
  cache.beginFrame();
  const mix = lodMix(camera.scale, visual.semanticZoom);
  const minScale = lerp(2, 0.75, visual.labelDensity);
  const showAll = camera.scale >= minScale && mix.card <= 0.6;
  let budget = Math.round(60 + visual.labelDensity * 420);

  for (let k = 0; k < cull.count; k += 1) {
    const i = cull.list[k];
    const neighbor = hoverIndex >= 0 && (hoverNeighbors?.has(i) ?? false);
    const accent = i === selectedIndex || i === hoverIndex || (focus?.has(i) ?? false)
      || state.isHub[i] === 1 || neighbor;
    if (!accent) {
      if (!showAll || budget <= 0) continue;
      budget -= 1;
    } else if (mix.card > 0.6 && i !== selectedIndex && i !== hoverIndex) {
      continue; // cards carry their own titles at close zoom
    }
    const screen = worldToScreen(camera, state.posX[i], state.posY[i]);
    const x = screen.x + state.radius[i] * visual.nodeScale * camera.scale + 6;
    const alpha = neighbor && i !== selectedIndex ? d.alpha * hoverFade : d.alpha;
    cache.draw(ctx, state.labelText[i] ?? state.ids[i], accent, x, screen.y, alpha);
  }
}
