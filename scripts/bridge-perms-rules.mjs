/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-perms-rules.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Share-rule storage for /api/perms/rules: public.osionos_share_rules through PostgREST with
 * the bridge's service identity (models/osionos-share-rules-migration.sql). Rules used to be
 * a JSON file in the bridge container's /tmp — lost on every recreate, absent from the vault.
 *
 * The bridge validates and rebuilds every rule (normalizeShareRule) before a query; the
 * row ↔ API mapping (toApiRule) keeps the shape the Share dialog already reads. Failures are
 * generic: a missing table — normal on a machine restored from an older snapshot — and refused
 * credentials are 503 with a server log line, anything else 502.
 */

import { httpError } from './bridge-social-core.mjs';
import { readBaasJson } from './bridge-baas-body.mjs';
import { bumpAccessAfter } from './bridge-access-generation.mjs';

const TABLE = 'osionos_share_rules';
const TEAMS_TABLE = 'osionos_teams';
const TEAM_MEMBERS_TABLE = 'osionos_team_members';
const MIGRATION = 'models/osionos-share-rules-migration.sql';
const LEVELS = new Set(['no_access', 'can_view', 'can_comment', 'can_edit', 'full_access']);
const RESOURCE_TYPES = new Set(['workspace', 'page', 'database', 'block']);
const PAGE_RESOURCE_TYPE = 'page';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_LIMIT = 500;
// A whole-workspace rule read is the page-access decision's single query (C511). It is
// higher than LIST_LIMIT because it covers every page, and a full answer still fails closed.
const WORKSPACE_RULES_LIMIT = 20000;
const TIMEOUT_MS = 5000;
const SELECT = 'id,workspace_id,resource_type,resource_id,target,permission,explicit,created_at,updated_at';

/** The 503 a rules read that cannot be trusted answers — never a silent "no rules". */
function shareRulesUnavailable() {
	return Object.assign(new Error('Share rules are not available right now.'), { status: 503, code: 'share_rules_unavailable' });
}

/** A bounded string field, or a 400. */
function boundedText(value, limit, field) {
	const text = value == null ? '' : String(value);
	if (text.length > limit) throw httpError(`${field} is too long`, 400);
	return text;
}

/** The rule target rebuilt from its known shapes only: {user,userId} {role,role} {team,teamId} {workspace} {public}. */
function normalizeTarget(target) {
	const type = target?.type;
	if (type === 'workspace' || type === 'public') return { type };
	if (type === 'user') {
		const userId = boundedText(target.userId, 64, 'target.userId');
		if (!userId) throw httpError('target.userId is required', 400);
		return { type, userId };
	}
	if (type === 'role') {
		const role = boundedText(target.role, 64, 'target.role');
		if (!role) throw httpError('target.role is required', 400);
		return { type, role };
	}
	if (type === 'team') {
		const teamId = boundedText(target.teamId, 64, 'target.teamId').toLowerCase();
		if (!teamId) throw httpError('target.teamId is required', 400);
		return { type, teamId };
	}
	throw httpError('target.type is invalid', 400);
}

/** The 422 for a team that is not in the rule's workspace — absent, deleted, archived or foreign alike. */
function teamNotFound() {
	return Object.assign(httpError('Team not found in this workspace.', 422), { code: 'team_not_found' });
}

/**
 * The rule identity within a resource. Only a team key grows a fourth segment: user and role keys
 * keep their stored 3-part form, so re-saving an existing rule still replaces it instead of
 * adding a twin.
 */
function targetKey(target) {
	const base = `${target.type}:${target.userId ?? ''}:${target.role ?? ''}`;
	return target.teamId ? `${base}:${target.teamId}` : base;
}

/** A client AccessRule → the row the bridge writes. Client ids and keys are never trusted. */
export function normalizeShareRule(input) {
	const workspaceId = boundedText(input?.workspaceId, 64, 'workspaceId');
	if (!workspaceId) throw httpError('workspaceId is required', 400);
	const permission = String(input?.permission ?? 'no_access');
	if (!LEVELS.has(permission)) throw httpError('permission is invalid', 400);
	const resourceType = String(input?.resourceType ?? 'page');
	if (!RESOURCE_TYPES.has(resourceType)) throw httpError('resourceType is invalid', 400);
	// A page id is a UUID stored lower-case (osionos_pages.id is UUID); the rule stores it
	// as TEXT, so normalise here so a rule written with an upper- or mixed-case id still
	// matches the page it is about. Workspace-wide rules ('') are untouched.
	let resourceId = boundedText(input?.resourceId, 256, 'resourceId');
	if (resourceType === 'page' && resourceId) resourceId = resourceId.toLowerCase();
	const target = normalizeTarget(input?.target ?? { type: 'workspace' });
	return {
		workspace_id: workspaceId,
		resource_type: resourceType,
		resource_id: resourceId,
		target,
		target_key: targetKey(target),
		permission,
		explicit: input?.explicit !== false,
	};
}

/** A stored row → the AccessRule shape the Share dialog reads ('' resource → null). */
export function toApiRule(row) {
	return {
		_id: row.id,
		workspaceId: row.workspace_id,
		resourceId: row.resource_id ? row.resource_id : null,
		resourceType: row.resource_type,
		target: row.target,
		permission: row.permission,
		explicit: row.explicit,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/** PostgREST-backed rule store; every method takes the per-request bridge config. */
export function createShareRuleStore({ fetchImpl = fetch, table = TABLE, log = console.error } = {}) {
	async function call(config, query, { method = 'GET', body, prefer, empty = [], from = table } = {}) {
		if (!config?.baasUrl || !config?.serviceKey) throw httpError('rule storage is not configured', 503);
		const headers = { Accept: 'application/json', apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` };
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (prefer) headers.Prefer = prefer;
		const response = await fetchImpl(`${config.baasUrl}/rest/v1/${from}?${query}`, {
			method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		// A non-2xx is classified by its status and its error code, so that body is read
		// here — where one that never arrives falls back to '' and the status alone decides.
		// Ponytail: with that body lost the SQLSTATE is lost too, so a status-500 answer
		// that meant "table missing" reads as 502 (failed) instead of 503 (unavailable).
		if (!response.ok) throw storeFailure(response.status, await response.text().catch(() => ''));
		// An empty answer means "no rules", which is an access decision — so a body that
		// stops mid-stream, or one that is not JSON, is reported as the broken read it is.
		return readBaasJson(response, { service: 'share rules', empty, fail: (message) => httpError(message, 502) });
	}

	function storeFailure(status, text) {
		let code = '';
		try { code = JSON.parse(text)?.code ?? ''; } catch { /* non-JSON error body */ }
		// Only PGRST205/42P01 mean the table is gone. Any other 404 is a broken read, and
		// answering [] for it would drop every deny the caller is under.
		if (code === '42P01' || code === 'PGRST205') {
			log(`[bridge-perms] table public.${table} is missing — apply ${MIGRATION} (psql -v ON_ERROR_STOP=1 -1 -f ${MIGRATION})`);
			return Object.assign(httpError('rule storage is not available', 503), { code: 'share_rules_table_missing' });
		}
		if (status === 404) {
			log(`[bridge-perms] rule storage answered 404 (${code || 'no code'}) — not a missing table`);
			return Object.assign(httpError('rule storage is not available', 503), { code: 'share_rules_unavailable' });
		}
		if (status === 401 || status === 403) {
			log(`[bridge-perms] PostgREST refused the bridge's service identity for ${table} (${status})`);
			return Object.assign(httpError('rule storage is not available', 503), { code: 'share_rules_unavailable' });
		}
		log(`[bridge-perms] rule storage failed (${status} ${code})`);
		return Object.assign(httpError('rule storage failed', 502), { code: 'share_rules_failed' });
	}

	const query = (params) => new URLSearchParams(params).toString();

	/**
	 * The rules that decide ONE page's access: the page's own rules and the workspace-wide
	 * ones (resource_id = ''). Two reads, so a workspace with hundreds of rules about OTHER
	 * pages cannot truncate the page's own rule — the reviewer's seed (500 other page rules
	 * plus one no_access on P) still denies P.
	 *
	 * A missing table answers [] — no rule can exist, so that is exact rather than
	 * fail-open. Every other failure (refused identity, upstream 5xx, timeout) is a 503,
	 * never []: a silent "no rules" would drop the deny the caller is under and hand the
	 * page to somebody who must not have it.
	 * Caveat: a server whose table vanished drops every deny; the server applies every
	 * models/*.sql (scripts/apply-models-migrations.sh), so the table is only missing on a
	 * desktop restored from an older snapshot.
	 */
	const listForPage = async (config, workspaceId, pageId) => {
		// A page id may arrive in any case (the request path does not lower-case it, and
		// Postgres UUID comparison is case-insensitive), but osionos_share_rules.resource_id
		// is TEXT and compared byte-exactly — normalise once here so the rule is found.
		const normalizedPageId = String(pageId ?? '').trim().toLowerCase();
		const params = {
			select: SELECT, workspace_id: `eq.${workspaceId}`, resource_type: `eq.${PAGE_RESOURCE_TYPE}`,
			order: 'created_at.asc', limit: String(LIST_LIMIT),
		};
		try {
			const [pageRules, wideRules] = await Promise.all([
				call(config, query({ ...params, resource_id: `eq.${normalizedPageId}` }), { empty: null }),
				call(config, query({ ...params, resource_id: 'eq.' }), { empty: null }),
			]);
			// An empty body is not an empty rule set: the read was broken, and deciding on
			// it would drop every deny the caller is under.
			if (pageRules === null || wideRules === null) throw shareRulesUnavailable();
			// A full page of rules may be a truncated set: a deny beyond the cap would be
			// dropped, so the read fails closed instead of deciding on half the rules.
			if (pageRules.length >= LIST_LIMIT || wideRules.length >= LIST_LIMIT) throw shareRulesUnavailable();
			return [...pageRules, ...wideRules].filter((row) => {
				const resourceId = row?.resource_id;
				return resourceId === '' || resourceId === null || String(resourceId).toLowerCase() === normalizedPageId;
			});
		} catch (error) {
			if (error?.code === 'share_rules_table_missing') return [];
			throw shareRulesUnavailable();
		}
	};

	/**
	 * listForPage for many pages of ONE workspace in two reads: pageId (lower-case) → that
	 * page's rules plus the workspace-wide ones. Fails closed exactly like listForPage.
	 * Caveat: a full LIST_LIMIT page of rules may be truncated, so it throws; keep the
	 * id list short (the caller sends at most 50 ids per call — Kong's header buffer).
	 */
	const listForPages = async (config, workspaceId, pageIds) => {
		const ids = [...new Set(pageIds.map((id) => String(id ?? '').trim().toLowerCase()))];
		const params = {
			select: SELECT, workspace_id: `eq.${workspaceId}`, resource_type: `eq.${PAGE_RESOURCE_TYPE}`,
			order: 'created_at.asc', limit: String(LIST_LIMIT),
		};
		try {
			const [pageRules, wideRules] = await Promise.all([
				call(config, query({ ...params, resource_id: `in.(${ids.join(',')})` }), { empty: null }),
				call(config, query({ ...params, resource_id: 'eq.' }), { empty: null }),
			]);
			if (pageRules === null || wideRules === null) throw shareRulesUnavailable();
			if (pageRules.length >= LIST_LIMIT || wideRules.length >= LIST_LIMIT) throw shareRulesUnavailable();
			const wide = wideRules.filter((row) => row?.resource_id === '' || row?.resource_id === null);
			return new Map(ids.map((id) => [id, [
				...pageRules.filter((row) => String(row?.resource_id ?? '').toLowerCase() === id),
				...wide,
			]]));
		} catch (error) {
			if (error?.code === 'share_rules_table_missing') return new Map(ids.map((id) => [id, []]));
			throw shareRulesUnavailable();
		}
	};

	/**
	 * EVERY page rule of ONE workspace in one read (C511): the page-access decision walks
	 * the whole workspace's rules and parent chain, so asking page by page would cost one
	 * query per row. Fails closed exactly like listForPage: a broken read, or a rule set
	 * at the cap (which may be truncated), is a 503 — never a silent "no rules".
	 */
	const listForWorkspace = async (config, workspaceId) => {
		const params = {
			select: SELECT, workspace_id: `eq.${workspaceId}`, resource_type: `eq.${PAGE_RESOURCE_TYPE}`,
			order: 'created_at.asc', limit: String(WORKSPACE_RULES_LIMIT),
		};
		try {
			const rows = await call(config, query(params), { empty: null });
			if (rows === null || rows.length >= WORKSPACE_RULES_LIMIT) throw shareRulesUnavailable();
			return rows;
		} catch (error) {
			if (error?.code === 'share_rules_table_missing') return [];
			throw shareRulesUnavailable();
		}
	};

	/**
	 * The caller's team ids in ONE workspace, read per request and never cached, or null when
	 * the read cannot be trusted. null is not []: the evaluator reads it as "unknown" and lets a
	 * team no_access rule still block, where [] would silently drop that deny.
	 * Caveat: an archived team still counts — archiving keeps its member rows.
	 */
	const teamIdsFor = async (config, workspaceId, userId) => {
		try {
			const rows = await call(config, query({
				select: 'team_id', workspace_id: `eq.${workspaceId}`, user_id: `eq.${userId}`, limit: String(LIST_LIMIT),
			}), { from: TEAM_MEMBERS_TABLE, empty: null });
			// A full page may be a truncated set: the same fail-closed rule as the rules read.
			if (!Array.isArray(rows) || rows.length >= LIST_LIMIT) return null;
			return rows.map((row) => String(row.team_id).toLowerCase());
		} catch {
			return null;
		}
	};

	/** A team rule is written only for a live team of the rule's own workspace (service-role read). */
	async function requireTeamInWorkspace(config, rule) {
		const teamId = rule.target.teamId;
		if (!UUID.test(teamId)) throw teamNotFound();
		const rows = await call(config, query({
			select: 'id', id: `eq.${teamId}`, workspace_id: `eq.${rule.workspace_id}`, archived_at: 'is.null', limit: '1',
		}), { from: TEAMS_TABLE });
		if (!rows[0]) throw teamNotFound();
	}

	return {
		listForPage,
		listForPages,
		listForWorkspace,
		teamIdsFor,
		async list(config, workspaceId, resourceId) {
			const params = { select: SELECT, workspace_id: `eq.${workspaceId}`, order: 'created_at.asc', limit: String(LIST_LIMIT) };
			if (resourceId == null) return (await call(config, query(params))).map(toApiRule);
			// A resource's effective grant also depends on the workspace-wide rules
			// (resource_id = ''), so both reads answer; the Share dialog filters its own view.
			const [own, wide] = await Promise.all([
				call(config, query({ ...params, resource_id: `eq.${String(resourceId).toLowerCase()}` })),
				resourceId === '' ? [] : call(config, query({ ...params, resource_id: 'eq.' })),
			]);
			return [...own, ...wide].map(toApiRule);
		},
		async upsert(config, rule) {
			if (rule.target.type === 'team') await requireTeamInWorkspace(config, rule);
			const body = { ...rule, updated_at: new Date().toISOString() };
			const rows = await bumpAccessAfter(call(config, query({ on_conflict: 'workspace_id,resource_type,resource_id,target_key', select: SELECT }), {
				method: 'POST', body, prefer: 'resolution=merge-duplicates,return=representation',
			}), { workspaceId: rule.workspace_id });
			return toApiRule(rows[0]);
		},
		async byId(config, id) {
			if (!UUID.test(String(id))) return null;
			const rows = await call(config, query({ select: SELECT, id: `eq.${id}`, limit: '1' }));
			return rows[0] ? toApiRule(rows[0]) : null;
		},
		async remove(config, id, workspaceId) {
			if (!UUID.test(String(id))) return false;
			const rows = await bumpAccessAfter(call(config, query({ id: `eq.${id}`, workspace_id: `eq.${workspaceId}`, select: 'id' }), {
				method: 'DELETE', prefer: 'return=representation',
			}), { workspaceId });
			return rows.length > 0;
		},
	};
}
