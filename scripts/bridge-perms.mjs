/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-perms.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Permission UX proxy for the osionos bridge (`/api/perms/*`).
 *
 * Standalone ES module: bridge-api.mjs (or any node:http server) wires it with
 *
 *     import { handlePermsRoute } from './bridge-perms.mjs';
 *     // inside the request dispatcher, BEFORE the 404 fallthrough:
 *     if (await handlePermsRoute(request, response, url)) return;
 *
 * `handlePermsRoute(request, response, url, fetchImpl?) -> Promise<boolean>`
 * returns false (untouched response) when the path is not /api/perms/*.
 *
 * Routes served:
 *   GET    /api/perms/people        → agency roster (.agency-people.env rows)
 *   GET    /api/perms/roles         → { roles:[{id,name,description,metadata}] }
 *   GET    /api/perms/policies      → { policies:[…incl. id] }
 *   POST   /api/perms/policies      → create resource policy (CreatePolicyDto)
 *   DELETE /api/perms/policies/:id  → delete resource policy
 *   GET    /api/perms/bundle        → PolicyBundle (user_roles + policies)
 *   POST   /api/perms/decide        → ABAC decision {allow,reason,mode,mask?}
 *   GET    /api/perms/rules?workspaceId&resourceId → page AccessRule list
 *   POST   /api/perms/rules         → upsert an AbacEngine AccessRule object
 *   DELETE /api/perms/rules/:id     → delete a stored AccessRule
 *
 * Upstream: the mini-baas Kong `/permissions/v1` route (key-auth + the
 * permission-engine ServiceTokenGuard). Page AccessRules (normal, non-live
 * pages) are persisted in a local JSON store the AbacEngine shape, so the
 * notion-database-sys Mongo store can replace it without UI changes.
 *
 * Required env (each with its dev fallback):
 *   PERMS_KONG_URL        Kong proxy origin            (fallback AGENCY_KONG_URL,
 *                                                       default http://127.0.0.1:8002)
 *   PERMS_SERVICE_APIKEY  Kong key-auth `apikey` (service_role consumer key)
 *                                                      (fallback AGENCY_SERVICE_APIKEY)
 *   PERMS_SERVICE_TOKEN   permission-engine X-Service-Token
 *                                                      (fallback ADAPTER_REGISTRY_SERVICE_TOKEN)
 *   PERMS_TENANT_ID       X-Tenant-Id scope            (fallback AGENCY_TENANT_SLUG,
 *                                                       default "agency")
 *   PERMS_PEOPLE_ENV      roster file path             (default <repo>/tools/seeds/.agency-people.env)
 *   PERMS_RULES_FILE      AccessRule JSON store path   (default <app>/.perms-rules.json)
 *
 * Dev convenience: apps/grobase/.agency-tenant.env and apps/grobase/.env are
 * sourced (without overriding already-set vars) so a stock `make agency-all`
 * checkout needs zero configuration.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(APP_ROOT, '../../..');
const JSON_BODY_LIMIT = 64 * 1024;

for (const file of [
	resolve(REPO_ROOT, 'apps/grobase/.agency-tenant.env'),
	resolve(REPO_ROOT, 'apps/grobase/.env'),
]) {
	if (!existsSync(file)) continue;
	let text = '';
	try { text = readFileSync(file, 'utf8'); } catch { continue; }
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#') || !line.includes('=')) continue;
		const [key, ...rest] = line.split('=');
		let value = rest.join('=').trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
		if (key && process.env[key] === undefined) process.env[key] = value;
	}
}

const CONFIG = {
	kongUrl: (process.env.PERMS_KONG_URL || process.env.AGENCY_KONG_URL || 'http://127.0.0.1:8002').replace(/\/$/, ''),
	serviceApikey: process.env.PERMS_SERVICE_APIKEY || process.env.AGENCY_SERVICE_APIKEY || '',
	serviceToken: process.env.PERMS_SERVICE_TOKEN || process.env.ADAPTER_REGISTRY_SERVICE_TOKEN || '',
	tenantId: process.env.PERMS_TENANT_ID || process.env.AGENCY_TENANT_SLUG || 'agency',
	peopleEnv: process.env.PERMS_PEOPLE_ENV || resolve(REPO_ROOT, 'tools/seeds/.agency-people.env'),
	rulesFile: process.env.PERMS_RULES_FILE || resolve(APP_ROOT, '.perms-rules.json'),
};

/** CORS origin for browser callers (the app runs cross-origin on :3001). */
const ALLOWED_ORIGIN = process.env.OSIONOS_ALLOWED_ORIGIN || 'https://localhost:3001';

function corsHeaders() {
	return {
		'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
		'Access-Control-Allow-Credentials': 'true',
		Vary: 'Origin',
	};
}

function sendJson(response, status, body) {
	const payload = JSON.stringify(body);
	response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() });
	response.end(payload);
	return true;
}

function readJsonBody(request) {
	return new Promise((resolveBody, rejectBody) => {
		let size = 0;
		const chunks = [];
		request.on('data', (chunk) => {
			size += chunk.length;
			if (size > JSON_BODY_LIMIT) { rejectBody(new Error('payload too large')); request.destroy(); return; }
			chunks.push(chunk);
		});
		request.on('end', () => {
			if (!chunks.length) { resolveBody({}); return; }
			try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
			catch { rejectBody(new Error('invalid JSON body')); }
		});
		request.on('error', rejectBody);
	});
}

/** Proxy one request to the permission-engine through Kong (service identity). */
async function proxyEngine(response, fetchImpl, method, path, body) {
	if (!CONFIG.serviceApikey || !CONFIG.serviceToken) {
		return sendJson(response, 503, { error: 'perms_not_configured', message: 'Set PERMS_SERVICE_APIKEY and PERMS_SERVICE_TOKEN (see bridge-perms.mjs header).' });
	}
	const headers = {
		apikey: CONFIG.serviceApikey,
		'X-Service-Token': CONFIG.serviceToken,
		'X-Tenant-Id': CONFIG.tenantId,
	};
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	let upstream;
	try {
		upstream = await fetchImpl(`${CONFIG.kongUrl}/permissions/v1${path}`, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(5000),
		});
	} catch (error) {
		return sendJson(response, 502, { error: 'perms_upstream_unreachable', message: String(error?.message || error) });
	}
	const text = await upstream.text();
	response.writeHead(upstream.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() });
	response.end(text || '{}');
	return true;
}

/** Roster rows from .agency-people.env → [{id,email,name,role,department,clearance,region,wsRole}]. */
function loadPeople() {
	if (!existsSync(CONFIG.peopleEnv)) return [];
	const people = [];
	for (const rawLine of readFileSync(CONFIG.peopleEnv, 'utf8').split(/\r?\n/)) {
		const match = /^AGENCY_PERSON_\d+=(.+)$/.exec(rawLine.trim());
		if (!match) continue;
		const [id, email, name, role, department, clearance, region, wsRole] = match[1].split('|');
		if (id && email) people.push({ id, email, name, role, department, clearance, region, wsRole });
	}
	return people;
}

function loadRules() {
	if (!existsSync(CONFIG.rulesFile)) return [];
	try {
		const parsed = JSON.parse(readFileSync(CONFIG.rulesFile, 'utf8'));
		return Array.isArray(parsed) ? parsed : [];
	} catch { return []; }
}

function saveRules(rules) {
	writeFileSync(CONFIG.rulesFile, `${JSON.stringify(rules, null, '\t')}\n`, { mode: 0o600 });
}

/** Upsert an AbacEngine AccessRule object (same workspace/resource/target key). */
function upsertRule(rules, input) {
	const targetKey = (t) => `${t?.type ?? ''}:${t?.userId ?? ''}:${t?.role ?? ''}`;
	const now = new Date().toISOString();
	const rule = {
		_id: typeof input._id === 'string' && input._id ? input._id : randomUUID(),
		workspaceId: String(input.workspaceId ?? ''),
		resourceId: input.resourceId == null ? null : String(input.resourceId),
		resourceType: String(input.resourceType ?? 'page'),
		target: input.target ?? { type: 'workspace' },
		permission: String(input.permission ?? 'no_access'),
		explicit: input.explicit !== false,
		createdAt: now,
		updatedAt: now,
	};
	const index = rules.findIndex((existing) => existing.workspaceId === rule.workspaceId
		&& String(existing.resourceId ?? '') === String(rule.resourceId ?? '')
		&& existing.resourceType === rule.resourceType
		&& targetKey(existing.target) === targetKey(rule.target));
	if (index >= 0) rule.createdAt = rules[index].createdAt ?? now;
	if (index >= 0) rules.splice(index, 1, rule); else rules.push(rule);
	return rule;
}

/** Route handler: true = handled (response ended), false = not a perms route. */
export async function handlePermsRoute(request, response, url, fetchImpl = fetch) {
	const pathname = url?.pathname ?? '';
	if (!pathname.startsWith('/api/perms/')) return false;
	const method = (request.method || 'GET').toUpperCase();
	const tail = pathname.slice('/api/perms/'.length).replace(/\/$/, '');
	try {
		if (method === 'GET' && tail === 'people') return sendJson(response, 200, { people: loadPeople() });
		if (method === 'GET' && tail === 'roles') return proxyEngine(response, fetchImpl, 'GET', '/permissions/bundles/roles');
		if (method === 'GET' && tail === 'policies') return proxyEngine(response, fetchImpl, 'GET', '/permissions/bundles/policies');
		if (method === 'POST' && tail === 'policies') {
			return proxyEngine(response, fetchImpl, 'POST', '/permissions/bundles/policies', await readJsonBody(request));
		}
		if (method === 'DELETE' && /^policies\/[0-9a-f-]{36}$/i.test(tail)) {
			return proxyEngine(response, fetchImpl, 'DELETE', `/permissions/bundles/${tail}`);
		}
		if (method === 'GET' && tail === 'bundle') return proxyEngine(response, fetchImpl, 'GET', '/permissions/bundles/latest');
		if (method === 'POST' && tail === 'decide') {
			return proxyEngine(response, fetchImpl, 'POST', '/permissions/decide', await readJsonBody(request));
		}
		if (method === 'GET' && tail === 'rules') {
			const workspaceId = url.searchParams.get('workspaceId') ?? '';
			const resourceId = url.searchParams.get('resourceId');
			const rules = loadRules().filter((rule) => (!workspaceId || rule.workspaceId === workspaceId)
				&& (resourceId == null || String(rule.resourceId ?? '') === resourceId));
			return sendJson(response, 200, { rules });
		}
		if (method === 'POST' && tail === 'rules') {
			const body = await readJsonBody(request);
			if (!body || typeof body !== 'object' || !body.workspaceId) {
				return sendJson(response, 400, { error: 'invalid_rule', message: 'workspaceId is required' });
			}
			const rules = loadRules();
			const rule = upsertRule(rules, body);
			saveRules(rules);
			return sendJson(response, 200, { rule });
		}
		if (method === 'DELETE' && tail.startsWith('rules/')) {
			const id = tail.slice('rules/'.length);
			const rules = loadRules();
			const next = rules.filter((rule) => rule._id !== id);
			if (next.length === rules.length) return sendJson(response, 404, { error: 'rule_not_found' });
			saveRules(next);
			return sendJson(response, 200, { deleted: true });
		}
	} catch (error) {
		return sendJson(response, error?.message === 'payload too large' ? 413 : 400, { error: 'perms_bad_request', message: String(error?.message || error) });
	}
	return sendJson(response, 404, { error: 'perms_route_not_found', message: `${method} ${pathname}` });
}

export const PERMS_ROUTE_PREFIX = '/api/perms/';
