/**
 * Compose one frame: clear, draw links + nodes under the world transform (with a
 * dim base pass + a full focus pass when a neighborhood is focused), overlay
 * rings, then draw labels in screen space. Pulled out of the scene class so the
 * orchestrator stays small.
 */

import { visibleWorldRect } from "../camera/controls";
import type { Camera } from "../camera/transform";
import type { SceneTheme } from "../theme/tokens";
import type { VisualState } from "../state/controls";
import type { RevealState } from "./reveal";
import type { SceneState } from "./sceneState";
import type { NodeSpriteCache } from "./sprites";
import type { DrawCtx } from "./drawTypes";
import { drawLinks } from "./links";
import { drawGlow } from "./glowPass";
import { drawNodes, drawNodeSprite } from "./nodes";
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
  reveal: RevealState;
  time: number;
  focus: ReadonlySet<number> | null;
  hoverIndex: number;
  selectedIndex: number;
  reducedMotion: boolean;
}

export function renderFrame(f: FrameInput): void {
  const { ctx, camera } = f;
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  ctx.clearRect(0, 0, f.width, f.height);

  const view = visibleWorldRect(camera, f.width, f.height);
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
  };

  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);

  if (f.focus) {
    const dim: DrawCtx = { ...base, alpha: f.theme.dimAlpha };
    drawLinks(dim);
    drawNodes(dim, f.sprites);
    drawGlow(base, f.hoverIndex, f.selectedIndex);
    drawLinks(base, true);
    drawNodes(base, f.sprites, true);
  } else {
    drawLinks(base);
    drawGlow(base, f.hoverIndex, f.selectedIndex);
    drawNodes(base, f.sprites);
  }
  // Raise the hovered + selected node above any overlap, then ring them on top.
  drawNodeSprite(base, f.sprites, f.selectedIndex);
  if (f.hoverIndex !== f.selectedIndex) drawNodeSprite(base, f.sprites, f.hoverIndex);
  drawRings(base, f.hoverIndex, f.selectedIndex);
  ctx.restore();

  drawLabels(base, f.focus, f.hoverIndex, f.selectedIndex);
}
