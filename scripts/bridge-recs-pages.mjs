/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs-pages.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 13:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 13:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The pages a slate may carry: their live rows, and only the ones the caller
 * may read NOW (devil C55) — the feed's rule (canReadPageRowAsMember with one
 * membership read), never the caller's own page, never a page whose owner is
 * hidden from the caller by a block in EITHER direction.
 */

import { canReadPageRowAsMember } from './bridge-page-read.mjs';
import { blockedViewerBy, memberWorkspacesAmong, rest } from './bridge-social-core.mjs';

/** The columns of the page rows the slate needs. */
const PAGE_SELECT = 'id,title,icon,workspace_id,owner_id,visibility,collaborators';

/**
 * Ids per page query. A slate asks for up to 400 ids (200 nearest + 200
 * recent): as one `id=in.(…)` that is ~15 KB of request line, past the 8 KB
 * an nginx in front of PostgREST accepts by default. 100 uuids is ~3.7 KB.
 */
const IDS_PER_QUERY = 100;

/** The live page rows of a set of ids, in queries of at most 100 ids. */
export async function readPages(deps, config, ids) {
	const list = [...new Set(ids.filter((id) => typeof id === 'string' && id !== ''))];
	const chunks = [];
	for (let start = 0; start < list.length; start += IDS_PER_QUERY) {
		chunks.push(list.slice(start, start + IDS_PER_QUERY));
	}
	const answers = await Promise.all(chunks.map((chunk) => rest(
		config,
		deps.fetchImpl,
		`osionos_pages?id=in.(${chunk.join(',')})&archived_at=is.null&select=${PAGE_SELECT}`,
	)));
	return answers.flatMap((rows) => (Array.isArray(rows) ? rows : []));
}

/**
 * The page rows the caller may read NOW, by id. Two reads: the memberships
 * (ONE call over every workspace the rows name) and the blocks.
 */
export async function readablePages(deps, config, session, rows) {
	const workspaces = rows.map((row) => row?.workspace_id).filter((id) => typeof id === 'string' && id !== '');
	const members = await memberWorkspacesAmong(config, deps.fetchImpl, session, workspaces);
	// The blocks are compared lower-cased on BOTH sides: Postgres writes the uuids
	// in lower case, but a token may carry an upper-case one (sameId's rule).
	const blocked = new Set([...await blockedViewerBy(config, deps.fetchImpl, session.userId)]
		.map((id) => String(id).toLowerCase()));
	const self = String(session.userId ?? '').toLowerCase();
	const readable = new Map();
	for (const row of rows) {
		const id = String(row?.id ?? '');
		if (id === '' || readable.has(id)) continue;
		const owner = String(row?.owner_id ?? '').toLowerCase();
		if (owner !== '' && owner === self) continue;
		if (owner !== '' && blocked.has(owner)) continue;
		if (!canReadPageRowAsMember(row, session.userId, members)) continue;
		readable.set(id, row);
	}
	// The SAME inherited rule as the page routes (C550): a recommendation never carries
	// a page an ancestor no_access hides. bridge-api always injects the filter.
	if (typeof deps.pageAccessFilter === 'function' && readable.size > 0) {
		const visible = await deps.pageAccessFilter([...readable.values()], session, config);
		const visibleIds = new Set(visible.map((row) => String(row?.id ?? '')));
		for (const id of readable.keys()) if (!visibleIds.has(id)) readable.delete(id);
	}
	return readable;
}

/** The default and the maximum number of pages a slate carries. */
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

/** The limit of the request, clamped into 1..20. */
export function limitFrom(url) {
	const raw = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
	if (!Number.isFinite(raw)) return DEFAULT_LIMIT;
	return Math.min(Math.max(raw, 1), MAX_LIMIT);
}
