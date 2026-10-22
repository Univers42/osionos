/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-harness-rpcs.mjs                            :+:      :+:    :+:   */
/*                                                    :::     :::         */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :::       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The two edge-read RPCs of the graph (scripts/bridge-graph-edges.mjs), as the
 * Postgres functions of models/osionos-ai-graph-migration.sql answer them: the
 * link rows whose source (or target) is in the given id sets, and the live rows
 * of a set of pages. The arrays ride in the BODY of the POST.
 *
 * The harness answers them for every world: a test that does not seed links
 * must still get an empty answer, not a table named after the RPC.
 */

/** The most ids one call takes; the SQL answers nothing above it. */
const MAX_IDS_PER_CALL = 1000;

/** The rows of the link read: the links whose source or target is in the sets. */
export function graphLinksRpc(body, { table }) {
	const sources = Array.isArray(body.p_source_ids) ? body.p_source_ids : null;
	const targets = Array.isArray(body.p_target_ids) ? body.p_target_ids : null;
	// Both NULL would be every link of the database: the function reads nothing.
	if (sources === null && targets === null) return [];
	if ((sources?.length ?? 0) > MAX_IDS_PER_CALL || (targets?.length ?? 0) > MAX_IDS_PER_CALL) return [];
	return table('osionos_page_links').filter(
		(row) =>
			(sources === null || sources.some((id) => String(id).toLowerCase() === String(row.source_page_id).toLowerCase())) &&
			(targets === null || targets.some((id) => String(id).toLowerCase() === String(row.target_page_id).toLowerCase())),
	);
}

/** The live rows of the pages of the set. */
export function pagesByIdsRpc(body, { table }) {
	const ids = Array.isArray(body.p_ids) ? body.p_ids : [];
	if (ids.length > MAX_IDS_PER_CALL) return [];
	return table('osionos_pages').filter((row) => ids.some((id) => String(id).toLowerCase() === String(row.id).toLowerCase()));
}

/** The RPCs every world answers. */
export const EDGE_RPCS = {
	osionos_bridge_graph_links: graphLinksRpc,
	osionos_bridge_pages_by_ids: pagesByIdsRpc,
};
