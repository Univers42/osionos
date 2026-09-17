/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-perms.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Permission UX proxy for the osionos bridge (`/api/perms/*`).
 *
 *     perms: createPermsHandler({ verifySession, requireWorkspaceAccess, fetchImpl })
 *     if (await social.perms(url, request, response, config)) return;
 *
 * Every route needs an app session (Authorization: Bearer <osionos_v1 token>).
 *   GET    /api/perms/people        → agency roster (.agency-people.env rows)
 *   GET    /api/perms/roles         → { roles:[{id,name,description,metadata}] }
 *   GET    /api/perms/policies      → { policies:[…incl. id] }
 *   POST   /api/perms/policies      → create resource policy          (admin only)
 *   DELETE /api/perms/policies/:id  → delete resource policy          (admin only)
 *   GET    /api/perms/bundle        → PolicyBundle (user_roles + policies)
 *   POST   /api/perms/decide        → ABAC decision {allow,reason,mode,mask?}
 *   GET    /api/perms/rules?workspaceId&resourceId → AccessRules      (workspace `read`)
 *   POST   /api/perms/rules         → upsert an AccessRule             (workspace `update`)
 *   DELETE /api/perms/rules/:id     → delete an AccessRule             (workspace `update`)
 * Workspace checks use the bridge's requireWorkspaceAccess (live membership, not the list
 * frozen into the token at login). Rules live in public.osionos_share_rules
 * (bridge-perms-rules.mjs); their ids are database-minted. Error bodies are generic; details
 * go to the server log.
 *
 * Upstream: the mini-baas Kong `/permissions/v1` route, called with the bridge's SERVICE
 * identity — hence the admin gate on writes. By default that is the bridge's own identity:
 * the Kong apikey is the key every other BaaS call of the bridge uses (config.serviceKey) and
 * the engine token is ADAPTER_REGISTRY_SERVICE_TOKEN. PERMS_SERVICE_APIKEY / AGENCY_SERVICE_APIKEY
 * and PERMS_SERVICE_TOKEN are optional overrides — copies of those secrets went stale once.
 * Other settings (env first, then the dev files apps/grobase/.agency-tenant.env and
 * apps/grobase/.env, read without touching process.env): PERMS_KONG_URL|AGENCY_KONG_URL,
 * PERMS_TENANT_ID|AGENCY_TENANT_SLUG, PERMS_PEOPLE_ENV, OSIONOS_ALLOWED_ORIGIN.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bearerToken, httpError } from './bridge-social-core.mjs';
import { createShareRuleStore, normalizeShareRule } from './bridge-perms-rules.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(APP_ROOT, '../../..');
const ROUTE_PREFIX = '/api/perms/';
const JSON_BODY_LIMIT = 64 * 1024;
const DEV_ENV_FILES = ['apps/grobase/.agency-tenant.env', 'apps/grobase/.env'];
const PUBLIC_ERRORS = {
	400: ['perms_bad_request', 'The request is invalid.'],
	401: ['unauthorized', 'Sign in to manage permissions.'],
	403: ['forbidden', 'You do not have permission to do that.'],
	404: ['not_found', 'Not found.'],
	413: ['payload_too_large', 'The request body is too large.'],
	500: ['perms_internal_error', 'Something went wrong on the bridge.'],
	502: ['perms_upstream_unreachable', 'The permission engine did not answer.'],
	503: ['perms_unavailable', 'Permissions are not available right now.'],
};

/** KEY=value pairs of the dev env files; the first file that defines a key wins. */
function readDevEnvFiles() {
	const values = {};
	for (const file of DEV_ENV_FILES.map((rel) => resolve(REPO_ROOT, rel))) {
		let text = '';
		try { text = readFileSync(file, 'utf8'); } catch { continue; }
		for (const line of text.split(/\r?\n/).map((raw) => raw.trim())) {
			const eq = line.indexOf('=');
			if (!line || line.startsWith('#') || eq < 1) continue;
			const value = line.slice(eq + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
			values[line.slice(0, eq)] ??= value;
		}
	}
	return values;
}

/** Upstream settings: the process environment first, then the dev env files (injectable).
 *  An empty serviceApikey means "use the bridge's own service key" at request time. */
export function loadPermsSettings(env = process.env, file = readDevEnvFiles()) {
	const pick = (...keys) => keys.map((key) => env[key] ?? file[key]).find(Boolean) ?? '';
	return {
		kongUrl: (pick('PERMS_KONG_URL', 'AGENCY_KONG_URL') || 'http://127.0.0.1:8002').replace(/\/$/, ''),
		serviceApikey: pick('PERMS_SERVICE_APIKEY', 'AGENCY_SERVICE_APIKEY'),
		serviceToken: pick('PERMS_SERVICE_TOKEN', 'ADAPTER_REGISTRY_SERVICE_TOKEN'),
		tenantId: pick('PERMS_TENANT_ID', 'AGENCY_TENANT_SLUG') || 'agency',
		peopleEnv: pick('PERMS_PEOPLE_ENV') || resolve(REPO_ROOT, 'tools/seeds/.agency-people.env'),
		allowedOrigin: pick('OSIONOS_ALLOWED_ORIGIN') || 'https://localhost:3001',
	};
}

function readJsonBody(request) {
	return new Promise((resolveBody, rejectBody) => {
		let size = 0;
		const chunks = [];
		request.on('data', (chunk) => {
			size += chunk.length;
			if (size > JSON_BODY_LIMIT) { rejectBody(httpError('payload too large', 413)); request.destroy(); return; }
			chunks.push(chunk);
		});
		request.on('end', () => {
			if (!chunks.length) { resolveBody({}); return; }
			try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
			catch { rejectBody(httpError('invalid JSON body', 400)); }
		});
		request.on('error', rejectBody);
	});
}

/** Roster rows → [{id,email,name,role,department,clearance,region,wsRole}]. A path that is
 *  not a regular file (docker creates a DIRECTORY for a missing bind source) is no roster. */
function loadPeople(peopleEnv) {
	if (!existsSync(peopleEnv) || !statSync(peopleEnv).isFile()) return [];
	const people = [];
	for (const rawLine of readFileSync(peopleEnv, 'utf8').split(/\r?\n/)) {
		const match = /^AGENCY_PERSON_\d+=(.+)$/.exec(rawLine.trim());
		if (!match) continue;
		const [id, email, name, role, department, clearance, region, wsRole] = match[1].split('|');
		if (id && email) people.push({ id, email, name, role, department, clearance, region, wsRole });
	}
	return people;
}

/** The PermsHandler factory; see the module doc for routes and rules. */
export function createPermsHandler({
	verifySession, requireWorkspaceAccess, fetchImpl = fetch,
	settings = loadPermsSettings(), ruleStore = createShareRuleStore({ fetchImpl }),
}) {
	const reply = (response, status, body) => {
		response.writeHead(status, {
			'Content-Type': 'application/json', 'Cache-Control': 'no-store',
			'Access-Control-Allow-Origin': settings.allowedOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin',
		});
		response.end(JSON.stringify(body));
		return true;
	};
	const fail = (response, status) => {
		const [error, message] = PUBLIC_ERRORS[status] ?? PUBLIC_ERRORS[400];
		return reply(response, PUBLIC_ERRORS[status] ? status : 400, { error, message });
	};
	const engine = createEngineProxy(settings, fetchImpl, reply, fail);
	const rules = createRuleRoutes({ ruleStore, requireWorkspaceAccess, fetchImpl, reply, fail });

	return async function handlePerms(url, request, response, requestConfig) {
		const pathname = url?.pathname ?? '';
		if (!pathname.startsWith(ROUTE_PREFIX)) return false;
		const method = (request.method || 'GET').toUpperCase();
		const tail = pathname.slice(ROUTE_PREFIX.length).replace(/\/$/, '');
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			const ctx = { url, request, response, requestConfig, session, method, tail };
			const handled = await (routeEngine(ctx, { engine, reply, fail, settings }) ?? rules(ctx));
			return handled ?? fail(response, 404);
		} catch (error) {
			const status = Number(error?.status) || 500;
			if (status >= 500) console.error('[bridge-perms]', method, pathname, error?.message || error);
			return fail(response, status);
		}
	};
}

/** Engine + roster routes; undefined when `tail` is not one of them. */
function routeEngine(ctx, { engine, reply, fail, settings }) {
	const { method, tail, response, request, session } = ctx;
	if (method === 'GET' && tail === 'people') return reply(response, 200, { people: loadPeople(settings.peopleEnv) });
	if (method === 'GET' && tail === 'roles') return engine(ctx, 'GET', '/permissions/bundles/roles');
	if (method === 'GET' && tail === 'policies') return engine(ctx, 'GET', '/permissions/bundles/policies');
	if (method === 'GET' && tail === 'bundle') return engine(ctx, 'GET', '/permissions/bundles/latest');
	if (method === 'POST' && tail === 'decide') return readJsonBody(request).then((body) => engine(ctx, 'POST', '/permissions/decide', body));
	const isPolicyWrite = (method === 'POST' && tail === 'policies') || (method === 'DELETE' && /^policies\/[0-9a-f-]{36}$/i.test(tail));
	if (!isPolicyWrite) return undefined;
	if (session.isAdmin !== true) return fail(response, 403);
	if (method === 'DELETE') return engine(ctx, 'DELETE', `/permissions/bundles/${tail}`);
	return readJsonBody(request).then((body) => engine(ctx, 'POST', '/permissions/bundles/policies', body));
}

/** Proxy one request to the permission engine through Kong, as the bridge's service identity.
 *  The engine refusing THOSE credentials (401/403) is a server fault → 503, never the
 *  caller's 401; an engine crash → 502; the engine's own validation errors pass through. */
function createEngineProxy(settings, fetchImpl, reply, fail) {
	return async ({ response, requestConfig }, method, path, body) => {
		const apikey = settings.serviceApikey || requestConfig?.serviceKey || '';
		if (!apikey || !settings.serviceToken) return fail(response, 503);
		const headers = { apikey, 'X-Service-Token': settings.serviceToken, 'X-Tenant-Id': settings.tenantId };
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		let upstream;
		try {
			upstream = await fetchImpl(`${settings.kongUrl}/permissions/v1${path}`, {
				method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
			});
		} catch (error) {
			console.error('[bridge-perms] engine unreachable:', error?.message || error);
			return fail(response, 502);
		}
		if (upstream.status === 401 || upstream.status === 403) {
			console.error(`[bridge-perms] the engine refused the bridge's service credentials (${upstream.status})`);
			return fail(response, 503);
		}
		if (upstream.status >= 500) return fail(response, 502);
		const text = await upstream.text();
		let parsed = {};
		try { parsed = text ? JSON.parse(text) : {}; } catch { return fail(response, 502); }
		return reply(response, upstream.status, parsed);
	};
}

/** Share-rule routes; resolves undefined when `tail` is not a rules route. A rule is validated
 *  and rebuilt before any query; DELETE touches a rule only after its workspace passes
 *  `update` (a rule the caller may not change reads as not found). */
function createRuleRoutes({ ruleStore, requireWorkspaceAccess, fetchImpl, reply, fail }) {
	const access = (ctx, workspaceId, permission) =>
		requireWorkspaceAccess(ctx.request, workspaceId, permission, ctx.requestConfig, fetchImpl);
	return async (ctx) => {
		const { method, tail, url, response, requestConfig } = ctx;
		if (method === 'GET' && tail === 'rules') {
			const workspaceId = url.searchParams.get('workspaceId');
			if (!workspaceId) return fail(response, 400);
			await access(ctx, workspaceId, 'read');
			return reply(response, 200, { rules: await ruleStore.list(requestConfig, workspaceId, url.searchParams.get('resourceId')) });
		}
		if (method === 'POST' && tail === 'rules') {
			const rule = normalizeShareRule(await readJsonBody(ctx.request));
			await access(ctx, rule.workspace_id, 'update');
			return reply(response, 200, { rule: await ruleStore.upsert(requestConfig, rule) });
		}
		if (method === 'DELETE' && tail.startsWith('rules/')) return deleteRule(ctx, decodeURIComponent(tail.slice('rules/'.length)));
		return undefined;
	};

	async function deleteRule(ctx, id) {
		const rule = await ruleStore.byId(ctx.requestConfig, id);
		if (!rule) return fail(ctx.response, 404);
		const allowed = await access(ctx, rule.workspaceId, 'update').then(() => true, () => false);
		if (!allowed || !(await ruleStore.remove(ctx.requestConfig, id, rule.workspaceId))) return fail(ctx.response, 404);
		return reply(ctx.response, 200, { deleted: true });
	}
}

export const PERMS_ROUTE_PREFIX = ROUTE_PREFIX;
