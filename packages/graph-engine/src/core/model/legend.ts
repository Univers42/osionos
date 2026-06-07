/**
 * Derive the legend the console's Filters panel needs: databases (with their
 * generated color + node count), tag hubs (with usage count), and the node kinds
 * present. Pure read over the model indexes — no rendering.
 */

import type { GraphModel, NodeKind } from "../types";
import { databaseColor } from "../theme/palette";

export interface LegendEntry {
  id: string;
  label: string;
  count: number;
  color: string;
}

export interface KindEntry {
  kind: NodeKind;
  count: number;
}

export interface Legend {
  databases: LegendEntry[];
  tags: LegendEntry[];
  kinds: KindEntry[];
}

export function deriveLegend(model: GraphModel): Legend {
  const databases: LegendEntry[] = [];
  for (const [id, ids] of model.byDatabase) {
    databases.push({ id, label: id, count: ids.length, color: databaseColor(id) });
  }
  databases.sort((a, b) => b.count - a.count);

  const tags: LegendEntry[] = [];
  const kindCounts = new Map<NodeKind, number>();
  for (const node of model.nodes) {
    kindCounts.set(node.kind, (kindCounts.get(node.kind) ?? 0) + 1);
    if (node.kind === "tag") {
      const degree = model.adjacency.get(node.id)?.length ?? 0;
      tags.push({ id: node.id, label: node.label, count: degree, color: "" });
    }
  }
  tags.sort((a, b) => b.count - a.count);

  const kinds: KindEntry[] = [...kindCounts.entries()].map(([kind, count]) => ({ kind, count }));
  return { databases, tags, kinds };
}
