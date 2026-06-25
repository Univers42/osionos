/**
 * Curated categorical palette for record/database nodes — the "Warm Constellation".
 *
 * Replaces the old golden-angle rainbow (which spun through every hue at high
 * chroma and looked like a different app from osionos's warm editorial brand).
 * Instead, databases draw from ONE harmonious, mid-tone family: warm-dominant
 * (terracotta → ochre → olive) with a few calm cool accents (teal/blue/plum) so
 * neighbouring databases stay distinguishable. The lightness/chroma band is held
 * deliberately narrow so every hue reads on BOTH the cream "paper" background and
 * the warm-dark "ember" background without per-theme recolouring — legibility per
 * theme is carried by the sprite *material* (paper sheet vs. matte stone), not the
 * fill hue. DOM-free and a pure function of the hash → deterministic + unit-safe.
 *
 * oklch keeps perceptual lightness even across hues and contains no "|", so the
 * sprite-cache key (`shape|color|glyph`) round-trips unchanged.
 */

/**
 * Eight mid-tone warm hues, hand-tuned as a set (not algorithmically spread):
 * terracotta-brown · clay · amber-ochre · warm-olive · muted-teal · dusty-blue ·
 * plum · dusty-rose. ~L 0.58–0.68, ~C 0.07–0.13 — a single calm band.
 */
export const WARM_CATEGORICAL = [
  "oklch(0.60 0.12 45)", // terracotta-brown
  "oklch(0.63 0.11 65)", // clay
  "oklch(0.68 0.12 85)", // amber-ochre
  "oklch(0.64 0.09 120)", // warm-olive
  "oklch(0.62 0.07 190)", // muted-teal
  "oklch(0.60 0.07 245)", // dusty-blue
  "oklch(0.58 0.09 320)", // plum
  "oklch(0.62 0.10 10)", // dusty-rose
] as const;

/** Deterministic pick from the curated family. `hash` is a non-negative int. */
export function pickCategorical(hash: number): string {
  return WARM_CATEGORICAL[hash % WARM_CATEGORICAL.length];
}
