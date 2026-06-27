/**
 * Bake a small, seeded warm-grain tile once → tiled via `createPattern` to give
 * the graph background a faint "paper" texture. Bake-once (only on setSize /
 * setTheme), so it never costs anything per frame. The speckle is seeded (a tiny
 * LCG, no Math.random) so it is identical across repaints — no twinkle, no churn.
 */

const SIZE = 64;

/** A SIZE×SIZE offscreen tile of faint `color` specks, or null without a 2D ctx. */
export function bakeGrainTile(color: string): HTMLCanvasElement | null {
  const tile = document.createElement("canvas");
  tile.width = SIZE;
  tile.height = SIZE;
  const ctx = tile.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = color;
  let seed = 0x1a2b3c4d; // deterministic → stable grain between repaints
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const count = Math.round(SIZE * SIZE * 0.16);
  for (let i = 0; i < count; i += 1) {
    ctx.globalAlpha = 0.4 + rand() * 0.6;
    ctx.fillRect(Math.floor(rand() * SIZE), Math.floor(rand() * SIZE), 1, 1);
  }
  ctx.globalAlpha = 1;
  return tile;
}
