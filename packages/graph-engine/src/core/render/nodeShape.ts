/**
 * The node "shape language": each kind reads as a distinct silhouette, not just a
 * color — records are filled discs, tag hubs are hollow rings, notes are ringed
 * orbs. DOM-free (no canvas) so both the scene state and the sprite cache can share
 * it, and it stays unit-testable. The sprite cache batches by `shape|color`, so a
 * single blit serves every node of the same kind+color.
 */

import type { NodeKind } from "../types";

export type NodeShape = "disc" | "ring" | "note";

/** Pick a node's silhouette from its kind. Records/databases → disc. */
export function shapeOf(kind: NodeKind): NodeShape {
  if (kind === "tag") return "ring";
  if (kind === "note") return "note";
  return "disc";
}

/** Composite cache/bucket key — `shape|color`. */
export function styleKey(shape: NodeShape, color: string): string {
  return `${shape}|${color}`;
}

/** Inverse of {@link styleKey}; color may itself contain no `|`. */
export function parseStyleKey(key: string): { shape: NodeShape; color: string } {
  const i = key.indexOf("|");
  return { shape: key.slice(0, i) as NodeShape, color: key.slice(i + 1) };
}
