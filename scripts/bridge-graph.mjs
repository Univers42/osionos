/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-graph.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure transform: osionos_pages rows -> a BaaS graph (`{nodes, edges, guarantee}`,
 * graph-contract.md shape) so the engine-agnostic graph reads the CANONICAL page
 * record instead of the duplicate Mongo `og_notes`. Each content page is a node
 * (resource `osionos_pages`, rendered note-coloured by the client); edges are the
 * page hierarchy (child->parent `parent`) and tag-by-name (`tagged` -> a `tags` node
 * per distinct tag). Owner-scoping is done by the caller (handleGraphPages); this
 * module is side-effect-free and unit-testable.
 */

const MOUNT = 'osionos';
const RESOURCE = 'osionos_pages';

/** A content page = a note node: not archived, page surface, not a database page. */
function isContentPageRow(row) {
	return Boolean(row) && !row.archived_at && !row.database_id && (row.surface == null || row.surface === 'page');
}

/** Real tags from a page's properties (a tag / multi-select array property). */
function pageTags(row) {
	const props = Array.isArray(row.properties) ? row.properties : [];
	const prop = props.find((entry) => entry && Array.isArray(entry.value)
		&& (/tag/i.test(entry.label || '') || /tag/i.test(entry.key || '') || /multi|tag/i.test(String(entry.type || ''))));
	return prop && Array.isArray(prop.value) ? prop.value.map(String).map((tag) => tag.trim()).filter(Boolean) : [];
}

/** One graph node per page (data fields are what the client's mapGraphResponse reads). */
function pageNode(row) {
	return {
		id: `${MOUNT}:${RESOURCE}:${row.id}`,
		mount: MOUNT,
		resource: RESOURCE,
		pk: String(row.id),
		data: {
			id: String(row.id),
			title: typeof row.title === 'string' && row.title ? row.title : 'Untitled',
			visibility: row.visibility || 'private',
			owner: row.owner_id ?? null,
			workspaceId: row.workspace_id,
			updatedAt: row.updated_at ?? null,
		},
	};
}

/** Build the owner-scoped page graph: note nodes + parent hierarchy + tag-by-name edges. */
export function pagesToGraph(rows) {
	const pages = (Array.isArray(rows) ? rows : []).filter(isContentPageRow);
	const ids = new Set(pages.map((row) => String(row.id)));
	const nodes = pages.map(pageNode);
	const tagNodes = new Map();
	const edges = [];
	for (const row of pages) {
		const childId = `${MOUNT}:${RESOURCE}:${row.id}`;
		const parent = row.parent_page_id ? String(row.parent_page_id) : '';
		if (parent && ids.has(parent)) {
			edges.push({ id: `parent:${row.id}`, from: childId, to: `${MOUNT}:${RESOURCE}:${parent}`, type: 'parent' });
		}
		for (const tag of pageTags(row)) {
			const tagId = `${MOUNT}:tags:${tag}`;
			if (!tagNodes.has(tagId)) tagNodes.set(tagId, { id: tagId, mount: MOUNT, resource: 'tags', pk: tag, data: { name: tag } });
			edges.push({ id: `tagged:${row.id}:${tag}`, from: childId, to: tagId, type: 'tagged' });
		}
	}
	return { depth: 0, nodes: [...nodes, ...tagNodes.values()], edges, guarantee: 'subgraph_eventual' };
}
