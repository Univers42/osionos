/**
 * The kinds of edge the graph shows, and the user's choice.
 *
 * The bridge sends four kinds of edge: the hierarchy (parent), the relations,
 * the tags, and the links — the inline [[page:]] mentions, read live from the
 * one link store. The user may hide the kinds they do not care about; the
 * choice is remembered, and it is a VIEW choice: no edge is ever removed from
 * the store.
 */

import type { IngestDoc } from "./toIngestDoc";

/** The kinds of edge the graph knows. */
export const EDGE_KINDS = ["note_link", "relation", "tag", "hierarchy"] as const;

/** One kind of edge. */
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** The words of the toggles. */
export const EDGE_KIND_LABELS: Record<EdgeKind, string> = {
	note_link: "Links",
	relation: "Relations",
	tag: "Tags",
	hierarchy: "Hierarchy",
};

const STORAGE_KEY = "osionos:graph-edge-kinds";

/** The kinds that are shown when the user has never chosen: all of them. */
export const DEFAULT_EDGE_KINDS: readonly EdgeKind[] = EDGE_KINDS;

/** One kind is one of ours, whatever the storage holds. */
function isEdgeKind(value: unknown): value is EdgeKind {
	return typeof value === "string" && (EDGE_KINDS as readonly string[]).includes(value);
}

/** The kinds the user chose, or all of them when there is no choice yet. */
export function loadEdgeKinds(): EdgeKind[] {
	try {
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
		if (!Array.isArray(stored)) return [...DEFAULT_EDGE_KINDS];
		const kinds = stored.filter(isEdgeKind);
		return kinds.length > 0 ? kinds : [...DEFAULT_EDGE_KINDS];
	} catch {
		return [...DEFAULT_EDGE_KINDS];
	}
}

/** The choice is remembered; a blocked storage lasts for this view only. */
export function saveEdgeKinds(kinds: readonly EdgeKind[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(kinds));
	} catch {
		// Storage blocked: the choice lasts for this view only.
	}
}

/** The edges of the kinds the user chose; the nodes are never touched. */
export function filterEdges(doc: IngestDoc, kinds: readonly string[]): IngestDoc {
	const kept = new Set<string>(kinds);
	return { ...doc, edges: doc.edges.filter((edge) => kept.has(edge.kind)) };
}
