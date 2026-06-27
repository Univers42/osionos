/**
 * Map graph data → concrete colors. Kept separate from token resolution so it is
 * trivially unit-testable (no DOM). Records are colored by database; notes/tags
 * use reserved hues; edges by kind.
 */

import type { EdgeKind, GraphNode } from "../types";
import type { SceneTheme } from "./tokens";
import { NOTE_COLOR, TAG_COLOR, databaseColor } from "./palette";

/** Minimal node shape needed to pick a color (avoids passing a full GraphNode). */
export type ColorNode = Pick<GraphNode, "kind" | "label" | "databaseId" | "source">;

/**
 * Resolve a node's base fill. `tagColors` lets the console recolor individual
 * tags (keyed by the tag node's label); records fall back to their database hue.
 */
export function nodeFill(node: ColorNode, tagColors?: Map<string, string>): string {
  if (node.kind === "note") return NOTE_COLOR;
  if (node.kind === "tag") return tagColors?.get(node.label) ?? TAG_COLOR;
  return databaseColor(node.databaseId ?? node.source);
}

/** Edge stroke color by kind. */
export function edgeStroke(theme: SceneTheme, kind: EdgeKind): string {
  if (kind === "tag") return theme.edgeTag;
  if (kind === "hierarchy") return theme.edgeHierarchy;
  if (kind === "note_of" || kind === "note_link") return theme.edgeNote;
  return theme.edge;
}
