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

const TABLE = 'osionos_share_rules';
const MIGRATION = 'models/osionos-share-rules-migration.sql';
const LEVELS = new Set(['no_access', 'can_view', 'can_comment', 'can_edit', 'full_access']);
const RESOURCE_TYPES = new Set(['workspace', 'page', 'database', 'block']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_LIMIT = 500;
const TIMEOUT_MS = 5000;
const SELECT = 'id,workspace_id,resource_type,resource_id,target,permission,explicit,created_at,updated_at';

/** A bounded string field, or a 400. */
function boundedText(value, limit, field) {
	const text = value == null ? '' : String(value);
	if (text.length > limit) throw httpError(`${field} is too long`, 400);
	return text;
}

/** The rule target rebuilt from its known shapes only: {user,userId} {role,role} {workspace} {public}. */
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
	throw httpError('target.type is invalid', 400);
}

/** A client AccessRule → the row the bridge writes. Client ids and keys are never trusted. */
export function normalizeShareRule(input) {
	const workspaceId = boundedText(input?.workspaceId, 64, 'workspaceId');
	if (!workspaceId) throw httpError('workspaceId is required', 400);
	const permission = String(input?.permission ?? 'no_access');
	if (!LEVELS.has(permission)) throw httpError('permission is invalid', 400);
	const resourceType = String(input?.resourceType ?? 'page');
	if (!RESOURCE_TYPES.has(resourceType)) throw httpError('resourceType is invalid', 400);
	const target = normalizeTarget(input?.target ?? { type: 'workspace' });
	return {
		workspace_id: workspaceId,
		resource_type: resourceType,
		resource_id: boundedText(input?.resourceId, 256, 'resourceId'),
		target,
		target_key: `${target.type}:${target.userId ?? ''}:${target.role ?? ''}`,
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
	async function call(config, query, { method = 'GET', body, prefer } = {}) {
		if (!config?.baasUrl || !config?.serviceKey) throw httpError('rule storage is not configured', 503);
		const headers = { Accept: 'application/json', apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` };
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (prefer) headers.Prefer = prefer;
		const response = await fetchImpl(`${config.baasUrl}/rest/v1/${table}?${query}`, {
			method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		const text = await response.text().catch(() => '');
		if (response.ok) return text ? JSON.parse(text) : [];
		throw storeFailure(response.status, text);
	}

	function storeFailure(status, text) {
		let code = '';
		try { code = JSON.parse(text)?.code ?? ''; } catch { /* non-JSON error body */ }
		if (status === 404 || code === '42P01' || code === 'PGRST205') {
			log(`[bridge-perms] table public.${table} is missing — apply ${MIGRATION} (psql -v ON_ERROR_STOP=1 -1 -f ${MIGRATION})`);
			return httpError('rule storage is not available', 503);
		}
		if (status === 401 || status === 403) {
			log(`[bridge-perms] PostgREST refused the bridge's service identity for ${table} (${status})`);
			return httpError('rule storage is not available', 503);
		}
		log(`[bridge-perms] rule storage failed (${status} ${code})`);
		return httpError('rule storage failed', 502);
	}

	const query = (params) => new URLSearchParams(params).toString();

	return {
		async list(config, workspaceId, resourceId) {
			const params = { select: SELECT, workspace_id: `eq.${workspaceId}`, order: 'created_at.asc', limit: String(LIST_LIMIT) };
			if (resourceId != null) params.resource_id = `eq.${resourceId}`;
			return (await call(config, query(params))).map(toApiRule);
		},
		async upsert(config, rule) {
			const body = { ...rule, updated_at: new Date().toISOString() };
			const rows = await call(config, query({ on_conflict: 'workspace_id,resource_type,resource_id,target_key', select: SELECT }), {
				method: 'POST', body, prefer: 'resolution=merge-duplicates,return=representation',
			});
			return toApiRule(rows[0]);
		},
		async byId(config, id) {
			if (!UUID.test(String(id))) return null;
			const rows = await call(config, query({ select: SELECT, id: `eq.${id}`, limit: '1' }));
			return rows[0] ? toApiRule(rows[0]) : null;
		},
		async remove(config, id, workspaceId) {
			if (!UUID.test(String(id))) return false;
			const rows = await call(config, query({ id: `eq.${id}`, workspace_id: `eq.${workspaceId}`, select: 'id' }), {
				method: 'DELETE', prefer: 'return=representation',
			});
			return rows.length > 0;
		},
	};
}
