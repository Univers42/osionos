/**
 * Semantic-zoom level-of-detail mix. Camera-scale-driven crossfades (not
 * time-driven), so the transitions are reduced-motion-safe by construction:
 * FAR (plain dots) → MID (icon baked into the sprite) → CLOSE (glass cards).
 * Bands nest inside the camera's zoom range (0.15..5); labels appear ~0.75–2.
 */

import { smoothstep } from "../math";

/** Camera scale where the baked icon fades in (start, width). */
const ICON_IN_START = 0.45;
const ICON_IN_WIDTH = 0.35;
/** Camera scale where cards crossfade in and sprites out. */
const CARD_IN_START = 1.9;
const CARD_IN_WIDTH = 0.7;

export interface LodMix {
  /** 0 = iconless dots, 1 = icon sprites. */
  icon: number;
  /** 0 = no cards, 1 = full card stage. */
  card: number;
  /** Sprite alpha complement of the card stage. */
  sprite: number;
}

export function lodMix(scale: number, semanticZoom: boolean): LodMix {
  if (!semanticZoom) return { icon: 0, card: 0, sprite: 1 };
  const icon = smoothstep((scale - ICON_IN_START) / ICON_IN_WIDTH);
  const card = smoothstep((scale - CARD_IN_START) / CARD_IN_WIDTH);
  return { icon, card, sprite: 1 - card };
}
