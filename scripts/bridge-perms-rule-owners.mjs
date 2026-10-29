/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-perms-rule-owners.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Who may change a share rule about a page.
 *
 * A rule is not only a setting: it is an access grant. A rule with no page id reaches
 * EVERY page of the workspace, and a rule about one page is that page's owner's to
 * write — so the workspace gate alone (a member carrying `update`) must not decide it.
 *
 * The caller's relation to the page the rule is about:
 * - 'owner'     the caller owns the page: the rule is theirs, and they may change it
 *               even when the workspace membership alone would not (an owner who is
 *               only a viewer there) — while they are still a member of the workspace
 *               (C557), or in the memberless marketplace;
 * - 'workspace' the rule has no page id, so it reaches every page of the workspace: a
 *               workspace decision, for the workspace owner/admin alone;
 * - 'unknown'   the rule is about a page that does not exist: nobody owns it, so it
 *               fails closed for anyone but the workspace owner/admin;
 * - 'foreign'   the page lives in another workspace than the rule: refused for everyone,
 *               a rule must never reach across workspaces;
 * - 'private'   the page is somebody else's PRIVATE page: refused for everyone (X1) —
 *               an admin may only DELETE a grant on it, never write one, never lift a deny;
 * - 'other'     the page exists and the caller does not own it: the page owner's rule,
 *               and the workspace owner/admin may change any rule;
 * - null        the rule is not about a page — or about an id that is not 8-4-4-4-12
 *               hex, so it names no page, governs nothing, and the workspace gate alone
 *               decides it.
 *
 * The page row is read with the bridge's service identity: the rule may name a page
 * the caller cannot even see.
 */

import { canChangePageSharing, MARKETPLACE_WORKSPACE_ID, pageVisibility, sameId } from './bridge-page-read.mjs';
import { rest } from './bridge-social-core.mjs';

// Any 8-4-4-4-12 hex id, not only RFC v1-5: a rule naming a non-v4 page id must still be
// checked against that page, never fall through to the workspace gate (X1-C4).
export const PAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The page a page rule is about, or null when it does not exist. */
async function rulePage(config, fetchImpl, pageId) {
	const rows = await rest(config, fetchImpl, `osionos_pages?id=eq.${encodeURIComponent(pageId)}&select=id,owner_id,workspace_id,visibility&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** How the caller stands to the page the rule is about (see the module doc). */
export async function ruleOwnerRelation({ config, fetchImpl, userId, rule }) {
	const type = rule?.resourceType ?? rule?.resource_type ?? '';
	if (type !== 'page') return null;
	const id = rule?.resourceId ?? rule?.resource_id ?? '';
	if (!id) return 'workspace';
	if (!PAGE_ID.test(String(id))) return null;
	const page = await rulePage(config, fetchImpl, id);
	if (!page) return 'unknown';
	if (!sameId(page.workspace_id, rule?.workspaceId ?? rule?.workspace_id)) return 'foreign';
	if (canChangePageSharing(page, userId)) return 'owner';
	return pageVisibility(page.visibility) === 'private' ? 'private' : 'other';
}

/**
 * Whether the caller may change this rule. `workspaceRole` is the caller's role in the
 * rule's workspace (null when the workspace gate refused them), `gated` says whether that
 * gate already passed them, `action` is 'create' or 'delete', and `isMember` resolves
 * whether the caller still belongs to the rule's workspace (read only for a page owner).
 */
export async function mayChangeRule(ctx, rule, { fetchImpl, workspaceRole, gated, action, isMember }) {
	const relation = await ruleOwnerRelation({
		config: ctx.requestConfig, fetchImpl, userId: ctx.session.userId, rule,
	});
	const isAdmin = workspaceRole === 'owner' || workspaceRole === 'admin';
	if (relation === 'owner') {
		if (sameId(rule?.workspaceId ?? rule?.workspace_id, MARKETPLACE_WORKSPACE_ID)) return true;
		return Boolean(await isMember().catch(() => false));
	}
	if (relation === null) return gated;
	if (relation === 'foreign') return false;
	if (relation === 'private') return action === 'delete' && isAdmin && rule?.permission !== 'no_access';
	return isAdmin;
}
