/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-graph.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure transform: osionos_pages rows -> a BaaS graph (`{nodes, edges, guarantee}`,
 * graph-contract.md shape) so the engine-agnostic graph reads the CANONICAL page
 * record instead of the duplicate Mongo `og_notes`. Nodes are pages AND folders
 * (folders are organizing "gap" nodes). Edges are:
 *   - `parent`   : the file/folder hierarchy (child -> parent_page_id),
 *   - `relation` : explicit page<->page links from `relation`-typed properties,
 *   - `tagged`   : tag-by-name (a `tags` node per distinct tag value).
 * Folders are kept as nodes so a note nested under a folder is NOT orphaned — the
 * earlier version excluded folders, which dropped every parent edge. Owner-scoping
 * is done by the caller (handleGraphPages); this module is side-effect-free.
 */

const MOUNT = 'osionos';
const RESOURCE = 'osionos_pages';

/** Graph-visible row: not archived, a content page/folder OR a record-note (a record
 *  the user opened as a note — `database_id` = `baas:<dbId>:<table>`). Plain database
 *  pages (other `database_id`) and app-only surfaces are excluded. Record-notes are
 *  kept so a note nested under an opened record keeps its hierarchy edge. */
function isGraphPageRow(row) {
	if (!row || row.archived_at) return false;
	if (row.database_id && !String(row.database_id).startsWith('baas:')) return false;
	const s = row.surface;
	return s == null || s === 'page' || s === 'folder';
}

function isFolderRow(row) {
	return Boolean(row) && row.surface === 'folder';
}

/** Real tags from a page's properties (a tag / multi-select array property). */
function pageTags(row) {
	const props = Array.isArray(row.properties) ? row.properties : [];
	const prop = props.find((entry) => entry && Array.isArray(entry.value)
		&& String(entry.type || '') !== 'relation'
		&& (/tag/i.test(entry.label || '') || /tag/i.test(entry.key || '') || /multi/i.test(String(entry.type || ''))));
	return prop && Array.isArray(prop.value) ? prop.value.map(String).map((tag) => tag.trim()).filter(Boolean) : [];
}

/** Target page ids from a page's `relation`-typed properties (the explicit links). */
function pageRelations(row) {
	const props = Array.isArray(row.properties) ? row.properties : [];
	const out = [];
	for (const prop of props) {
		if (prop && prop.type === 'relation' && Array.isArray(prop.value)) {
			for (const value of prop.value) if (typeof value === 'string' && value) out.push(value);
		}
	}
	return out;
}

/** One graph node per page/folder (data fields are what the client's mapGraphResponse reads). */
function pageNode(row) {
	const folder = isFolderRow(row);
	return {
		id: `${MOUNT}:${RESOURCE}:${row.id}`,
		mount: MOUNT,
		resource: folder ? 'folders' : RESOURCE,   // distinct resource -> client can colour folders
		pk: String(row.id),
		data: {
			id: String(row.id),
			title: typeof row.title === 'string' && row.title ? row.title : 'Untitled',
			icon: row.icon ?? null,   // so the graph node shows the page's emoji/icon, not a letter
			kind: folder ? 'folder' : 'page',
			surface: row.surface ?? null,
			visibility: row.visibility || 'private',
			owner: row.owner_id ?? null,
			workspaceId: row.workspace_id,
			updatedAt: row.updated_at ?? null,
		},
	};
}

/** Build the owner-scoped page graph: page+folder nodes + parent + relation + tag edges. */
export function pagesToGraph(rows) {
	const pages = (Array.isArray(rows) ? rows : []).filter(isGraphPageRow);
	const ids = new Set(pages.map((row) => String(row.id)));
	const nodes = pages.map(pageNode);
	const tagNodes = new Map();
	const edges = [];
	const seen = new Set();
	const addEdge = (id, from, to, type) => {
		if (seen.has(id)) return;
		seen.add(id);
		edges.push({ id, from, to, type });
	};
	const nodeId = (id) => `${MOUNT}:${RESOURCE}:${id}`;
	for (const row of pages) {
		const self = nodeId(row.id);
		const parent = row.parent_page_id ? String(row.parent_page_id) : '';
		if (parent && ids.has(parent)) {
			addEdge(`parent:${row.id}`, self, nodeId(parent), 'parent');
		}
		for (const target of pageRelations(row)) {
			if (target !== String(row.id) && ids.has(target)) {
				addEdge(`rel:${row.id}:${target}`, self, nodeId(target), 'relation');
			}
		}
		for (const tag of pageTags(row)) {
			const tagId = `${MOUNT}:tags:${tag}`;
			if (!tagNodes.has(tagId)) {
				tagNodes.set(tagId, { id: tagId, mount: MOUNT, resource: 'tags', pk: tag, data: { name: tag } });
			}
			addEdge(`tagged:${row.id}:${tag}`, self, tagId, 'tagged');
		}
	}
	return { depth: 0, nodes: [...nodes, ...tagNodes.values()], edges, guarantee: 'subgraph_eventual' };
}
