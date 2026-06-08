/**
 * Shared draw context passed to each render pass, so the draw functions stay
 * small and free (no giant parameter lists). The scene assembles this once per
 * frame inside the world transform.
 */

import type { Camera } from "../camera/transform";
import type { WorldBounds } from "../camera/transform";
import type { SceneTheme } from "../theme/tokens";
import type { VisualState } from "../state/controls";
import type { RevealState } from "./reveal";
import type { SceneState } from "./sceneState";

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  state: SceneState;
  view: WorldBounds;
  camera: Camera;
  theme: SceneTheme;
  visual: VisualState;
  /** Animation clock (ms). */
  time: number;
  reveal: RevealState;
  /** Global alpha multiplier (1 normal; theme.dimAlpha for the dimmed base pass). */
  alpha: number;
  /** Focus neighborhood (node indices), or null when nothing is focused. */
  focus: ReadonlySet<number> | null;
  /** When true, decorative effects (ambient hub glow) are suppressed. */
  reducedMotion: boolean;
}

export const TAG_EDGE_MIN_SCALE = 0.45;
export const ARROW_MIN_SCALE = 1.4;
export const LABEL_MIN_SCALE = 1.05;
