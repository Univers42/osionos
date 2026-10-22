/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-share-rules.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The share-rule evaluator: what the rules stored in public.osionos_share_rules grant to
 * one caller for ONE page. Pure — no I/O, no clock, and it never throws on a malformed
 * rule (a malformed rule grants nothing and denies nothing).
 *
 * The levels are the app's own vocabulary (src/features/share/types.ts): no_access is an
 * EXPLICIT DENY, can_view reads, can_comment reads (and never writes), can_edit writes,
 * full_access writes. A deny beats every grant.
 *
 * The bridge owns the exemptions: the page owner and the workspace owner/admin keep their
 * access whatever the rules say, so they never reach this module.
 *
 * Caveat: a rule is read as it is stored — the row shape (resource_id, resource_type) or
 * the API shape the store answers (resourceId, resourceType). The store maps a
 * workspace-wide rule ('') to a null resource, so both spellings of "the whole workspace"
 * are matched here.
 */

import { sameId } from './bridge-page-read.mjs';

export const SHARE_LEVELS = ['no_access', 'can_view', 'can_comment', 'can_edit', 'full_access'];

const LEVEL_INDEX = new Map(SHARE_LEVELS.map((level, index) => [level, index]));
const PAGE_RESOURCE = 'page';
const READ_LEVEL = 'can_view';
const WRITE_LEVEL = 'can_edit';

/** The field of a rule, whichever shape it arrives in. undefined when the rule has none. */
function field(rule, snake, camel) {
	if (!rule || typeof rule !== 'object') return undefined;
	if (Object.hasOwn(rule, snake)) return rule[snake];
	if (Object.hasOwn(rule, camel)) return rule[camel];
	return undefined;
}

/** The level of a rule, or null when it carries none this module knows. */
function rulePermission(rule) {
	const permission = field(rule, 'permission', 'permission');
	return typeof permission === 'string' && LEVEL_INDEX.has(permission) ? permission : null;
}

/** The resource a rule is about: '' (the whole workspace), a page id, or undefined (malformed). */
function ruleResourceId(rule) {
	const raw = field(rule, 'resource_id', 'resourceId');
	if (raw === undefined) return undefined;
	return raw === null ? '' : String(raw);
}

/** The target of a rule, rebuilt from its known shapes only: {type} {userId} {role}. */
function ruleTarget(rule) {
	const target = rule?.target;
	if (!target || typeof target !== 'object') return null;
	const type = typeof target.type === 'string' ? target.type : '';
	if (type === 'user') return { type, userId: typeof target.userId === 'string' ? target.userId : '' };
	if (type === 'role') return { type, role: typeof target.role === 'string' ? target.role : '' };
	if (type === 'workspace' || type === 'public') return { type };
	return null;
}

/** Two ids (or two roles) are the same whatever their case. */
function sameText(left, right) {
	return left != null && right != null && String(left).toLowerCase() === String(right).toLowerCase();
}

/**
 * Whether a rule is about the caller: a user target names them, a role target names their
 * role, a workspace target names their workspace, a public target names everyone. A rule
 * about another resource type is not a page rule and never matches.
 */
export function ruleMatchesCaller(rule, ctx) {
	if (!rule || typeof rule !== 'object') return false;
	if (field(rule, 'resource_type', 'resourceType') !== PAGE_RESOURCE) return false;
	const target = ruleTarget(rule);
	if (!target) return false;
	if (target.type === 'user') return sameId(target.userId, ctx?.userId);
	if (target.type === 'role') return sameText(target.role, ctx?.role);
	if (target.type === 'workspace') return sameId(field(rule, 'workspace_id', 'workspaceId'), ctx?.workspaceId);
	return target.type === 'public';
}

/**
 * The level the caller keeps for one page: the best level among the rules that match them
 * and are about that page (or the whole workspace), or null when none matches. A
 * no_access rule beats every grant.
 */
export function bestShareLevel(rules, ctx, pageId) {
	if (!Array.isArray(rules)) return null;
	let best = null;
	for (const rule of rules) {
		const permission = rulePermission(rule);
		if (!permission) continue;
		const resourceId = ruleResourceId(rule);
		if (resourceId === undefined) continue;
		if (resourceId !== '' && !sameId(resourceId, pageId)) continue;
		if (!ruleMatchesCaller(rule, ctx)) continue;
		if (permission === 'no_access') return 'no_access';
		if (best === null || LEVEL_INDEX.get(permission) > LEVEL_INDEX.get(best)) best = permission;
	}
	return best;
}

/** The level denies the caller — an explicit "no access". */
export function shareDenies(level) {
	return level === 'no_access';
}

/** The level lets the caller read the page. */
export function shareGrantsRead(level) {
	const index = LEVEL_INDEX.get(level);
	return index !== undefined && index >= LEVEL_INDEX.get(READ_LEVEL);
}

/** The level lets the caller write the page. */
export function shareGrantsWrite(level) {
	const index = LEVEL_INDEX.get(level);
	return index !== undefined && index >= LEVEL_INDEX.get(WRITE_LEVEL);
}
