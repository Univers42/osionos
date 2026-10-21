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
	const links = linkEdgeIds(await read(LINK_EDGES_RPC, { p_source_ids: sourceIds, p_target_ids: targetIds }));
	if (links.length === 0) return { links: [], rows: new Map() };
	const ids = [...new Set(links.flatMap((link) => [link.source, link.target]))];
	const rows = await read(PAGE_ROWS_RPC, { p_ids: ids });
	const byId = new Map();
	for (const row of Array.isArray(rows) ? rows : []) {
		if (row && row.id) byId.set(String(row.id).toLowerCase(), row);
	}
	return { links: readableLinkEdges(links, rows, userId, workspaces, allowed), rows: byId };
}

/**
 * The same read, straight from the database: the AI service has a pool, not a
 * BaaS, and asks the very same function.
 *
 * @param {import('pg').Pool} db the pool
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
