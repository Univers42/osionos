/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-access.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The ONE page-access decision, shared by every page surface (C510-C512).
 *
 * Pure: no I/O, no clock, never throws. The caller loads, once per request and per
 * workspace, the workspace's rules (`rulesByPage`) and the id → parent page map
 * (`parentOf`); this module decides one page.
 *
 * Resolution order (C510):
 *   1. the page owner and the workspace owner/admin are exempt — they keep the
 *      access they have today, whatever the rules say;
 *   2. every page in the ancestor chain is checked for a matching `no_access`: one
 *      anywhere denies the page (deny wins, fail closed);
 *   3. else the best grant on the NEAREST page in the chain (the page itself, then
 *      its parent, …) that carries at least one matching rule;
 *   4. else the visibility default — the read rule the bridge already applies, so a
 *      page with no rule behaves exactly as it did before inheritance.
 *
 * A cycle, a parent id missing from the map (orphan), or a chain deeper than
 * MAX_ANCESTOR_DEPTH is fail-closed: 'none'. The parent map is always read live, so
 * moving a page changes its chain at the next request; nothing is cached here.
 * A malformed rule grants nothing (bridge-share-rules.mjs skips it): an unknown
 * permission cannot become a deny, and it cannot become a grant either.
 */

import { canReadPageRow, sameId } from './bridge-page-read.mjs';
import { bestShareLevel } from './bridge-share-rules.mjs';

/** The ancestor walk stops (and denies) past this many pages: a cycle cannot loop forever. */
export const MAX_ANCESTOR_DEPTH = 50;

/** A workspace-wide rule is stored with resource_id '' — the store keeps it under that key. */
const WORKSPACE_WIDE = '';

const NONE = 'none';

function idOf(value) {
	return value == null ? '' : String(value).toLowerCase();
}

/** The rules of one page: its own, plus the workspace-wide ones (resource_id ''). */
function rulesAt(rulesByPage, pageId) {
	const own = rulesByPage instanceof Map ? rulesByPage.get(pageId) : null;
	const wide = rulesByPage instanceof Map ? rulesByPage.get(WORKSPACE_WIDE) : null;
	return [...(Array.isArray(own) ? own : []), ...(Array.isArray(wide) ? wide : [])];
}

/**
 * The ancestor chain of one page, page first, root last. Returns null (fail closed)
 * when a parent cannot be proven to exist in the map, when a cycle is met, or when
 * the chain is longer than MAX_ANCESTOR_DEPTH.
 */
function ancestorChain(pageId, parentOf) {
	if (!(parentOf instanceof Map) || !parentOf.has(pageId)) return null;
	const chain = [];
	const seen = new Set();
	let current = pageId;
	for (;;) {
		if (seen.has(current) || !parentOf.has(current)) return null;
		seen.add(current);
		chain.push(current);
		if (chain.length > MAX_ANCESTOR_DEPTH) return null;
		const parent = parentOf.get(current);
		if (parent === null || parent === undefined || parent === '') return chain;
		const next = idOf(parent);
		if (!next || next === current) return null;
		current = next;
	}
}

/**
 * The level `userId` keeps for `row`: 'none' | 'can_view' | 'can_comment' |
 * 'can_edit' | 'full_access'.
 *
 * @param {object} input
 * @param {object|null} input.row the osionos_pages row (id, owner_id, workspace_id, visibility, collaborators)
 * @param {string} input.userId the caller
 * @param {{ role?: string } | null} [input.member] the caller's workspace membership, null when none
 * @param {Map<string, object[]>} [input.rulesByPage] lower-case page id → its rules; '' holds workspace-wide rules
 * @param {Map<string, string|null>} [input.parentOf] lower-case page id → lower-case parent id or null
 * @param {string[] | null} [input.teamIds] the caller's team ids, null when unread (fail closed for team grants)
 * @returns {'none'|'can_view'|'can_comment'|'can_edit'|'full_access'}
 */
export function pageAccessLevel({ row, userId, member = null, rulesByPage = new Map(), parentOf = new Map(), teamIds = null } = {}) {
	if (!row || typeof row !== 'object' || !userId) return NONE;
	// Page owner: their own page stays readable under a denying ancestor (C510e).
	if (sameId(row.owner_id, userId)) return 'full_access';
	// Workspace owner/admin: the rules never reach them, but the page's own visibility
	// still does — an admin does not become able to read another member's private page.
	const role = typeof member?.role === 'string' ? member.role.toLowerCase() : '';
	if (role === 'owner' || role === 'admin') return canReadPageRow(row, userId) ? 'full_access' : NONE;
	// A caller with no membership row is not a member of this workspace: fail closed.
	if (!member) return NONE;

	const pageId = idOf(row.id);
	if (!pageId) return NONE;
	const chain = ancestorChain(pageId, parentOf);
	if (!chain) return NONE;

	const ctx = { userId, role: member.role, workspaceId: row.workspace_id, teamIds };
	let nearest = null;
	for (const id of chain) {
		const level = bestShareLevel(rulesAt(rulesByPage, id), ctx, id);
		// Deny wins even when a closer page grants: keep walking the whole chain.
		if (level === 'no_access') return NONE;
		if (nearest === null && level !== null) nearest = level;
	}
	if (nearest !== null) return nearest;
	// No matching rule anywhere: today's visibility rule decides.
	return canReadPageRow(row, userId) ? 'can_view' : NONE;
}
