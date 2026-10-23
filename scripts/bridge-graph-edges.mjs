/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-graph-edges.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { canReadPageRowAsMember } from './bridge-page-read.mjs';

/**
 * The ONE edge read of the graph (C99).
 *
 * The edges of the graph are the inline [[page:]] links of osionos_page_links.
 * There is no second extractor and no stored copy: the rows are read live, and
 * BOTH endpoints are checked against the live osionos_pages row — archived
 * pages included, on either end. The workspace of an edge row is NEVER the
 * workspace of the ACL: an edge carries no copy of the permissions of its
 * endpoints, so the decision is made on the pages themselves.
 *
 * The SQL of the read lives in ONE place, the Postgres function of
 * models/osionos-ai-graph-migration.sql (osionos_bridge_graph_links and
 * osionos_bridge_pages_by_ids). This module is its only caller: the bridge
 * asks for it through the BaaS (the arrays ride in the BODY of the POST, never
 * in an `in.(…)` URL, which Kong's header buffer would truncate), and the AI
 * service asks for it straight from its pool.
 *
 * No count, no degree, no adjacency list: the caller gets the edges, and
 * nothing else. Nothing here is cached — an edge read outlives no request.
 */

/** The RPC that reads the link rows. */
export const LINK_EDGES_RPC = 'osionos_bridge_graph_links';

/** The RPC that reads the live rows of a set of pages. */
export const PAGE_ROWS_RPC = 'osionos_bridge_pages_by_ids';

/**
 * The most ids one call of the two RPCs takes. The Postgres functions answer
 * nothing above it (models/osionos-ai-graph-migration.sql), and this module
 * cuts a bigger set into calls of this size, so the graph of a big workspace
 * loses no edge. The graph view has no node limit of its own: the bound is per
 * call, not per graph.
 */
export const MAX_IDS_PER_CALL = 1000;

/** The same read, straight from the database: the AI service has a pool, not a BaaS. */
export const LINK_EDGES_SQL = `
	select source_page_id, target_page_id
	from public.osionos_bridge_graph_links($1::uuid[], $2::uuid[])`;

/** The live rows of a set of pages, straight from the database. */
export const PAGE_ROWS_SQL = `
	select id, workspace_id, owner_id, visibility, collaborators, title, icon, archived_at
	from public.osionos_bridge_pages_by_ids($1::uuid[])`;

/**
 * The link rows as the pairs they are: the source page and the target page.
 *
 * @param {unknown} rows the rows of the link read
 * @returns {{ source: string, target: string }[]}
 */
export function linkEdgeIds(rows) {
	return (Array.isArray(rows) ? rows : [])
		.filter((row) => row && row.source_page_id && row.target_page_id)
		.map((row) => ({ source: String(row.source_page_id), target: String(row.target_page_id) }));
}

/**
 * The link edges both endpoints of which the caller may read.
 *
 * Pure: the rows decide, the function never asks anything else. An endpoint
 * that is gone, archived, or unreadable takes the edge with it — there is no
 * ghost node and no dangling edge.
 *
 * @param {{ source: string, target: string }[]} links the link rows
 * @param {unknown[]} pageRows the live rows of the endpoints
 * @param {string} userId the caller
 * @param {readonly string[]} workspaces the workspaces the caller may read (C98)
 * @param {Set<string> | null} [allowed] the pages the answer may mention
 * @returns {{ source: string, target: string }[]}
 */
export function readableLinkEdges(links, pageRows, userId, workspaces, allowed = null) {
	const byId = new Map();
	for (const row of Array.isArray(pageRows) ? pageRows : []) {
		if (row && row.id) byId.set(String(row.id).toLowerCase(), row);
	}
	const out = [];
	for (const link of Array.isArray(links) ? links : []) {
		const source = byId.get(link.source.toLowerCase());
		const target = byId.get(link.target.toLowerCase());
		if (!source || !target) continue;
		if (source.archived_at || target.archived_at) continue;
		if (!canReadPageRowAsMember(source, userId, workspaces)) continue;
		if (!canReadPageRowAsMember(target, userId, workspaces)) continue;
		if (allowed && !(allowed.has(link.source) && allowed.has(link.target))) continue;
		out.push({ source: link.source, target: link.target });
	}
	return out;
}

/**
 * The link edges of a set of pages, for a caller.
 *
 * @param {(rpc: string, body: Record<string, unknown>) => Promise<unknown[]>} read the reader of the two RPCs
 * @param {object} options
 * @param {string[] | null} [options.sourceIds] the pages whose outgoing links are read
 * @param {string[] | null} [options.targetIds] the pages whose incoming links are read
 * @param {string} options.userId the caller
 * @param {readonly string[]} options.workspaces the workspaces the caller may read (C98)
 * @param {Set<string> | null} [options.allowed] the pages the answer may mention
 * @returns {Promise<{ links: { source: string, target: string }[], rows: Map<string, unknown> }>}
 *   the edges, and the live rows of their endpoints (a caller that shows a
 *   title reads it here, never from a second query)
 */
export async function readLinkEdges(read, { sourceIds = null, targetIds = null, userId, workspaces, allowed = null }) {
	// Both null would read every link of the database: refused here and in SQL.
	if (sourceIds === null && targetIds === null) throw new Error('readLinkEdges needs sourceIds or targetIds');
	if (sourceIds !== null && targetIds !== null && targetIds.length > MAX_IDS_PER_CALL) {
		throw new Error(`readLinkEdges batches one set: targetIds holds more than ${MAX_IDS_PER_CALL} ids`);
	}
	const linkRows = sourceIds !== null
		? await readInBatches(sourceIds, (batch) => read(LINK_EDGES_RPC, { p_source_ids: batch, p_target_ids: targetIds }))
		: await readInBatches(targetIds, (batch) => read(LINK_EDGES_RPC, { p_source_ids: null, p_target_ids: batch }));
	const links = linkEdgeIds(linkRows);
	if (links.length === 0) return { links: [], rows: new Map() };
	const ids = [...new Set(links.flatMap((link) => [link.source, link.target]))];
	const rows = await readInBatches(ids, (batch) => read(PAGE_ROWS_RPC, { p_ids: batch }));
	const readable = readableLinkEdges(links, rows, userId, workspaces, allowed);
	// Only the rows of a readable edge's endpoints leave the module: a caller
	// that shows a title is never handed the row of a page it may not read.
	const kept = new Set(readable.flatMap((link) => [link.source.toLowerCase(), link.target.toLowerCase()]));
	const byId = new Map();
	for (const row of rows) {
		const id = row && row.id ? String(row.id).toLowerCase() : '';
		if (kept.has(id)) byId.set(id, row);
	}
	return { links: readable, rows: byId };
}

/** The rows of `read` over `ids`, in calls of at most MAX_IDS_PER_CALL ids. */
async function readInBatches(ids, read) {
	const rows = [];
	for (let start = 0; start < ids.length; start += MAX_IDS_PER_CALL) {
		const batch = await read(ids.slice(start, start + MAX_IDS_PER_CALL));
		if (Array.isArray(batch)) rows.push(...batch);
	}
	return rows;
}

/**
 * The same read, straight from the database: the AI service has a pool, not a
 * BaaS, and asks the very same function.
 *
 * The reader is a RUNNER, not a pool: the AI service runs this read on the
 * connection it already holds (a request that holds a connection while asking
 * the pool for a second one deadlocks the pool).
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }} db the pool, or one of its clients
 * @param {object} options the options of readLinkEdges
 * @returns {Promise<{ links: { source: string, target: string }[], rows: Map<string, unknown> }>}
 */
export async function readLinkEdgesFromDb(db, { sourceIds = null, targetIds = null, userId, workspaces, allowed = null }) {
	const read = async (rpc, body) => {
		const sql = rpc === LINK_EDGES_RPC ? LINK_EDGES_SQL : PAGE_ROWS_SQL;
		const params = rpc === LINK_EDGES_RPC ? [body.p_source_ids ?? null, body.p_target_ids ?? null] : [body.p_ids ?? []];
		const result = await db.query(sql, params);
		return result.rows;
	};
	return readLinkEdges(read, { sourceIds, targetIds, userId, workspaces, allowed });
}
