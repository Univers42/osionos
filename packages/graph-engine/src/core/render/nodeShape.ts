/**
 * The node "shape language": each kind reads as a distinct silhouette, not just a
 * color — records are filled discs, tag hubs are hollow rings, notes are ringed
 * orbs. DOM-free (no canvas) so both the scene state and the sprite cache can share
 * it, and it stays unit-testable. The sprite cache batches by `shape|color|glyph`,
 * so a single blit serves every node of the same kind+color+icon.
 */

import type { NodeKind } from "../types";

export type NodeShape = "disc" | "ring" | "note";

/** Sprite material mode, derived from the resolved theme background. */
export type SpriteMode = "light" | "dark";

/** Everything the sprite painter needs from the theme. */
export interface SpriteStyle {
  backing: string;
  mode: SpriteMode;
}

/** Pick a node's silhouette from its kind. Records/databases → disc. */
export function shapeOf(kind: NodeKind): NodeShape {
  if (kind === "tag") return "ring";
  if (kind === "note") return "note";
  return "disc";
}

/** Composite cache/bucket key — `shape|color|glyph` (glyph segment may be empty). */
export function styleKey(shape: NodeShape, color: string, glyph = ""): string {
  return `${shape}|${color}|${glyph}`;
}

/** Inverse of {@link styleKey}. Colors contain no `|`; the glyph is the tail. */
export function parseStyleKey(key: string): { shape: NodeShape; color: string; glyph: string } {
  const first = key.indexOf("|");
  const second = key.indexOf("|", first + 1);
  return {
    shape: key.slice(0, first) as NodeShape,
    color: key.slice(first + 1, second),
    glyph: key.slice(second + 1),
  };
}

/** The icon-less variant of a style key (the FAR-zoom sprite). */
export function baseKeyOf(key: string): string {
  const first = key.indexOf("|");
  const second = key.indexOf("|", first + 1);
  return key.slice(0, second + 1);
}
