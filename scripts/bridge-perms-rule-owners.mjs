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
 *               only a viewer there);
 * - 'workspace' the rule has no page id, so it reaches every page of the workspace: a
 *               workspace decision, for the workspace owner/admin alone;
 * - 'unknown'   the rule is about a page that does not exist: nobody owns it, so it
 *               fails closed for anyone but the workspace owner/admin;
 * - 'other'     the page exists and the caller does not own it: the page owner's rule,
 *               and the workspace owner/admin may change any rule;
 * - null        the rule is not about a page — or about a page id that cannot be one,
 *               so it governs nothing and the workspace gate alone decides it.
 *
 * The page row is read with the bridge's service identity: the rule may name a page
 * the caller cannot even see.
 */

import { canChangePageSharing } from './bridge-page-read.mjs';
import { rest, UUID_REGEX } from './bridge-social-core.mjs';

/** The page a page rule is about, or null when it does not exist. */
async function rulePage(config, fetchImpl, pageId) {
	const rows = await rest(config, fetchImpl, `osionos_pages?id=eq.${encodeURIComponent(pageId)}&select=id,owner_id&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** How the caller stands to the page the rule is about (see the module doc). */
export async function ruleOwnerRelation({ config, fetchImpl, userId, rule }) {
	const type = rule?.resourceType ?? rule?.resource_type ?? '';
	if (type !== 'page') return null;
	const id = rule?.resourceId ?? rule?.resource_id ?? '';
	if (!id) return 'workspace';
	if (!UUID_REGEX.test(String(id))) return null;
	const page = await rulePage(config, fetchImpl, id);
	if (!page) return 'unknown';
	return canChangePageSharing(page, userId) ? 'owner' : 'other';
}

/**
 * Whether the caller may change this rule. `workspaceRole` is the caller's role in the
 * rule's workspace (null when the workspace gate refused them) and `gated` says whether
 * that gate already passed them.
 */
export async function mayChangeRule(ctx, rule, { fetchImpl, workspaceRole, gated }) {
	const relation = await ruleOwnerRelation({
		config: ctx.requestConfig, fetchImpl, userId: ctx.session.userId, rule,
	});
	if (relation === 'owner') return true;
	if (relation === null) return gated;
	return workspaceRole === 'owner' || workspaceRole === 'admin';
}
