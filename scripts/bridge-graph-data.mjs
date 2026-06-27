/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-graph-data.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure transforms for the multi-engine DATA graph: turn a workspace's authorized
 * mounts (osionos_workspace_databases rows) into a query-router /graph/overview
 * request, then merge the returned record graph with the note graph (pagesToGraph)
 * into one BaaS graph (`{nodes, edges, guarantee}`, graph-contract.md shape). The
 * network call + access resolution live in bridge-api.mjs (handleGraphData); this
 * module is side-effect-free, mirroring bridge-graph.mjs.
 */

// Rows loaded per resource for the "all data" graph. Kept at the original fast
// baseline (a few thousand nodes total) for smooth normal use; the query-router can
// page far past this, so raise OSIONOS_GRAPH_RECORD_LIMIT for a denser survey.
const RECORD_LIMIT = Number(process.env.OSIONOS_GRAPH_RECORD_LIMIT) || 400;

/**
 * Build a /graph/overview request from osionos_workspace_databases rows.
 * @param {Array<{db_id?:string, tables?:string[], edges_table?:string}>} wsdbRows
 * @returns {{resources:Array<{dbId:string,table:string}>, limit:number, edgesDbId?:string, edgesTable?:string}|null}
 *   null when no row contributes a resource (caller then skips the record graph).
 */
export function overviewRequest(wsdbRows, limit = RECORD_LIMIT) {
	const resources = [];
	let edgesDbId;
	let edgesTable;
	for (const row of Array.isArray(wsdbRows) ? wsdbRows : []) {
		const tables = Array.isArray(row.tables) ? row.tables : [];
		for (const table of tables) {
			if (row.db_id && table) resources.push({ dbId: row.db_id, table });
		}
		if (!edgesDbId && row.db_id && row.edges_table) {
			edgesDbId = row.db_id;
			edgesTable = row.edges_table;
		}
	}
	if (resources.length === 0) return null;
	const request = { resources, limit };
	if (edgesDbId) {
		request.edgesDbId = edgesDbId;
		request.edgesTable = edgesTable;
	}
	return request;
}

/**
 * Merge two BaaS graphs (notes ⊕ records) into one, de-duping nodes by id and edges
 * by id (synthesised from from→to:type when an edge carries none). Malformed edges
 * (missing endpoint) are dropped.
 */
export function mergeGraphs(primary, secondary) {
	const nodes = new Map();
	for (const node of [...(primary?.nodes ?? []), ...(secondary?.nodes ?? [])]) {
		if (node && node.id != null) nodes.set(String(node.id), node);
	}
	const edges = new Map();
	for (const edge of [...(primary?.edges ?? []), ...(secondary?.edges ?? [])]) {
		if (!edge || edge.from == null || edge.to == null) continue;
		const id = edge.id != null ? String(edge.id) : `${edge.from}->${edge.to}:${edge.type ?? ''}`;
		edges.set(id, { id, ...edge });
	}
	return {
		depth: 0,
		nodes: [...nodes.values()],
		edges: [...edges.values()],
		guarantee: secondary?.guarantee ?? primary?.guarantee ?? 'subgraph_eventual',
	};
}
