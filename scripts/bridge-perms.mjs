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
 * Every route needs an app session (Authorization: Bearer <osionos_v1 token>). The five engine
 * reads below (people, roles, policies, bundle, decide) also need `?workspaceId=` of a workspace
 * the caller can read: 422 without it, 403 on a workspace they are not in. The engine and the
 * roster are tenant-wide, so beyond that: people is narrowed to the workspace's members unless
 * the caller is an admin; roles, policies and bundle are admin-only; decide is limited to the
 * caller's own user.id unless they are an admin.
 *   GET    /api/perms/people        → agency roster (.agency-people.env rows)
 *   GET    /api/perms/roles         → { roles:[{id,name,description,metadata}] }  (admin only)
 *   GET    /api/perms/policies      → { policies:[…incl. id] }                    (admin only)
 *   POST   /api/perms/policies      → create resource policy          (admin only)
 *   DELETE /api/perms/policies/:id  → delete resource policy          (admin only)
 *   GET    /api/perms/bundle        → PolicyBundle (user_roles + policies)       (admin only)
 *   POST   /api/perms/decide        → ABAC decision {allow,reason,mode,mask?}
 *   GET    /api/perms/rules?workspaceId[&resourceId][&inherited=1] → AccessRules (workspace `read`)
 *   POST   /api/perms/rules         → upsert an AccessRule             (workspace `update`)
 *   DELETE /api/perms/rules/:id     → delete an AccessRule             (workspace `update`)
 * The rules READ is scoped to what the caller can see (G1b): a page the caller's level on is
 * 'none' — missing, in another workspace, private to somebody else, or denied by a rule on it
 * or an ancestor — answers exactly like GET /api/pages/:id's missing page (404, same body).
 * The list form returns the workspace-wide rules plus the rules of pages the caller can read;
 * database/block/workspace-type rules only to the workspace owner/admin. `&inherited=1` adds
 * the readable strict ancestors' rules, nearest first, each with a structural `reaches`, and
 * `hiddenInherited` when an unreadable ancestor contributes nothing. Any failed read is a 503
 * `page_access_unavailable`, never a filtered-looking rules array.
 * A rule ABOUT a page is the page owner's to change (the workspace owner/admin may change
 * any rule): the workspace gate alone would let any member carrying `update` rewrite who
 * may read somebody else's page.
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
import { bearerToken, httpError, rest } from './bridge-social-core.mjs';
import { createShareRuleStore, normalizeShareRule, toApiRule } from './bridge-perms-rules.mjs';
import { mayChangeRule, PAGE_ID } from './bridge-perms-rule-owners.mjs';
import { ancestorChain, ruleReachesPage } from './bridge-page-access.mjs';
import { idChunks, inFilter, runChunks } from './bridge-paging.mjs';
import { sameId } from './bridge-page-read.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(APP_ROOT, '../../..');
const ROUTE_PREFIX = '/api/perms/';
const JSON_BODY_LIMIT = 64 * 1024;
// The columns canReadPageRow/decidePageAccess read for a level check; `collaborators` is the
// one neither the parent map nor the rules store carries (F8).
const PAGE_ROW_SELECT = 'id,workspace_id,owner_id,visibility,collaborators';
const DEV_ENV_FILES = ['apps/grobase/.agency-tenant.env', 'apps/grobase/.env'];
const PUBLIC_ERRORS = {
	400: ['perms_bad_request', 'The request is invalid.'],
	401: ['unauthorized', 'Sign in to manage permissions.'],
	403: ['forbidden', 'You do not have permission to do that.'],
	422: ['workspace_required', 'Name the workspace this request is for.'],
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
	// Injected by bridge-api.mjs so this module never imports it back (the two form a cycle):
	// the SAME per-request access loader and level evaluator every page surface uses (C608).
	createPageAccessLoader, pageLevelFor,
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
	// C600/F9: the rules read answers a page the caller may not see EXACTLY like the page
	// routes answer a missing id — the same status and byte-identical body.
	const replyPageNotFound = (response) => {
		response.writeHead(404, {
			'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
			'access-control-allow-origin': settings.allowedOrigin,
			'access-control-allow-credentials': 'true', vary: 'Origin',
		});
		response.end(JSON.stringify({ ok: false, message: 'Page not found.' }));
		return true;
	};
	// C602: a broken access read is never an empty-looking rule list.
	const replyAccessUnavailable = (response) => {
		response.writeHead(503, {
			'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
			'access-control-allow-origin': settings.allowedOrigin,
			'access-control-allow-credentials': 'true', vary: 'Origin',
		});
		response.end(JSON.stringify({
			ok: false, message: 'Page access could not be verified right now.', code: 'page_access_unavailable',
		}));
		return true;
	};
	const engine = createEngineProxy(settings, fetchImpl, reply, fail);
	const rules = createRuleRoutes({
		ruleStore, requireWorkspaceAccess, fetchImpl, reply, fail, replyPageNotFound, replyAccessUnavailable,
		createPageAccessLoader, pageLevelFor,
	});

	return async function handlePerms(url, request, response, requestConfig) {
		const pathname = url?.pathname ?? '';
		if (!pathname.startsWith(ROUTE_PREFIX)) return false;
		const method = (request.method || 'GET').toUpperCase();
		const tail = pathname.slice(ROUTE_PREFIX.length).replace(/\/$/, '');
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			const ctx = { url, request, response, requestConfig, session, method, tail };
			if (isEngineRead(method, tail)) {
				const workspaceId = url.searchParams.get('workspaceId');
				if (!workspaceId) return fail(response, 422);
				await requireWorkspaceAccess(request, workspaceId, 'read', requestConfig, fetchImpl);
			}
			const handled = await (routeEngine(ctx, { engine, reply, fail, settings, fetchImpl }) ?? rules(ctx));
			return handled ?? fail(response, 404);
		} catch (error) {
			const status = Number(error?.status) || 500;
			if (status >= 500) console.error('[bridge-perms]', method, pathname, error?.message || error);
			return fail(response, status);
		}
	};
}

const ENGINE_READ_TAILS = new Set(['people', 'roles', 'policies', 'bundle']);

/** G6 F6: the roster/engine reads and decide answer with the bridge's service identity,
 *  so each is scoped to a workspace the caller can read (`?workspaceId=`), not just a session. */
function isEngineRead(method, tail) {
	return (method === 'GET' && ENGINE_READ_TAILS.has(tail)) || (method === 'POST' && tail === 'decide');
}

/** The roster is tenant-wide (the engine is keyed by X-Tenant-Id, not by workspace), so a
 *  non-admin sees only the people who share the workspace they named. */
async function peopleInWorkspace(ctx, workspaceId, { fetchImpl, settings }) {
	const everyone = loadPeople(settings.peopleEnv);
	if (ctx.session.isAdmin === true) return everyone;
	const rows = await rest(ctx.requestConfig, fetchImpl, `osionos_workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=user_id&limit=1000`);
	const memberIds = new Set(rows.map((row) => String(row.user_id).toLowerCase()));
	return everyone.filter((person) => memberIds.has(String(person.id).toLowerCase()));
}

/** A non-admin may only ask what the engine says about themselves; refusing beats rewriting,
 *  because a silent rewrite would show the "View as" tester the wrong person's answer. */
function decideBodyFor(session, body) {
	if (session.isAdmin === true) return body;
	const asked = body?.user?.id;
	if (asked !== undefined && String(asked).toLowerCase() !== session.userId.toLowerCase()) throw httpError('decide is limited to your own account', 403);
	return { ...body, user: { ...body?.user, id: session.userId } };
}

/** Engine + roster routes; undefined when `tail` is not one of them. */
function routeEngine(ctx, { engine, reply, fail, settings, fetchImpl }) {
	const { method, tail, response, request, session, url } = ctx;
	const isAdminOnlyRead = method === 'GET' && ['roles', 'policies', 'bundle'].includes(tail);
	if (isAdminOnlyRead && session.isAdmin !== true) return fail(response, 403);
	if (method === 'GET' && tail === 'people') return peopleInWorkspace(ctx, url.searchParams.get('workspaceId'), { fetchImpl, settings }).then((people) => reply(response, 200, { people }));
	if (method === 'GET' && tail === 'roles') return engine(ctx, 'GET', '/permissions/bundles/roles');
	if (method === 'GET' && tail === 'policies') return engine(ctx, 'GET', '/permissions/bundles/policies');
	if (method === 'GET' && tail === 'bundle') return engine(ctx, 'GET', '/permissions/bundles/latest');
	if (method === 'POST' && tail === 'decide') return readJsonBody(request).then((body) => engine(ctx, 'POST', '/permissions/decide', decideBodyFor(session, body)));
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
 *  `update` (a rule the caller may not change reads as not found). Who may change a rule
 *  ABOUT a page is decided in bridge-perms-rule-owners.mjs: a rule is an access grant, so
 *  the workspace gate alone would let any member carrying `update` rewrite who may read
 *  somebody else's page.
 *  The READ is scoped by the shared page-access loader (C600-C608): a page the caller's
 *  level on is 'none' answers the page route's 404, and a failed read answers 503. */
function createRuleRoutes({
	ruleStore, requireWorkspaceAccess, fetchImpl, reply, fail, replyPageNotFound, replyAccessUnavailable,
	createPageAccessLoader, pageLevelFor,
}) {
	const access = (ctx, workspaceId, permission) =>
		requireWorkspaceAccess(ctx.request, workspaceId, permission, ctx.requestConfig, fetchImpl);
	const pageAccessUnavailable = () => Object.assign(
		new Error('Page access could not be verified right now.'),
		{ status: 503, code: 'page_access_unavailable' },
	);
	// Only the { id } column set is safe to put in a PostgREST filter; PAGE_ID rejects an
	// upper-case id only for the filter, not for the lookup (C614).
	const pageIdOf = (value) => {
		const text = String(value ?? '');
		return PAGE_ID.test(text) ? text.toLowerCase() : null;
	};
	const loadAccess = (ctx, workspaceId, { forceMeta = false } = {}) => {
		if (typeof createPageAccessLoader !== 'function' || typeof pageLevelFor !== 'function') throw pageAccessUnavailable();
		return createPageAccessLoader(ctx.session, ctx.requestConfig, fetchImpl, null, { forceMeta }).entryFor(workspaceId);
	};
	// The caller's level on a row under the already-loaded map. A row of another workspace
	// is not readable through THIS workspace's map, whatever its visibility.
	const levelOn = (entry, row, workspaceId, userId) =>
		row && sameId(row.workspace_id, workspaceId) ? pageLevelFor(entry, row, userId) : 'none';

	/** ONE page row with the columns the level check needs; a failed read is a 503. */
	const readPageRow = async (ctx, pageId) => {
		try {
			const rows = await rest(ctx.requestConfig, fetchImpl,
				`osionos_pages?id=eq.${pageId}&select=${PAGE_ROW_SELECT}&limit=1`);
			return Array.isArray(rows) ? rows[0] ?? null : null;
		} catch {
			throw pageAccessUnavailable();
		}
	};

	/** id → row for `ids`, validated first and read in ≤50-id chunks, chunks in parallel. */
	const readPageRows = async (ctx, ids) => {
		const valid = [...new Set((ids ?? []).map(pageIdOf).filter(Boolean))];
		if (valid.length === 0) return new Map();
		let parts;
		try {
			parts = await runChunks(idChunks(valid), (chunk) => rest(ctx.requestConfig, fetchImpl,
				`osionos_pages?${inFilter('id', chunk)}&select=${PAGE_ROW_SELECT}&limit=${chunk.length}`));
		} catch {
			throw pageAccessUnavailable();
		}
		const rows = new Map();
		for (const row of parts.flat()) {
			if (row?.id) rows.set(String(row.id).toLowerCase(), row);
		}
		return rows;
	};

	/** The strict ancestors' rules for a readable page (C608), from the decision's own walk. */
	const inheritedRules = async (ctx, entry, pageId, row, workspaceId) => {
		const chain = ancestorChain(pageId, entry.parentOf);
		if (!chain) return { inherited: [], hiddenInherited: false };
		const ancestors = chain.slice(1);
		const rows = await readPageRows(ctx, ancestors);
		const inherited = [];
		let hiddenInherited = false;
		for (const [index, ancestorId] of ancestors.entries()) {
			const ancestorRow = rows.get(ancestorId);
			// An unreadable ancestor contributes no id, title, target or rule: only the signal.
			if (!ancestorRow || levelOn(entry, ancestorRow, workspaceId, ctx.session.userId) === 'none') {
				hiddenInherited = true;
				continue;
			}
			// Parent … ancestor inclusive: the run ruleReachesPage replays.
			const path = chain.slice(1, index + 2);
			for (const rule of entry.rulesByPage.get(ancestorId) ?? []) {
				inherited.push({
					rule: toApiRule(rule), fromPageId: ancestorId,
					reaches: ruleReachesPage({ rule, row, ancestorId, path, pageMeta: entry.pageMeta }),
				});
			}
		}
		return { inherited, hiddenInherited };
	};

	/** C603/C605: wide rules + read page rules to a member; non-page types to owner/admin. */
	const listVisibleRules = async (ctx, workspaceId, isAdmin) => {
		const [all, entry] = await Promise.all([
			ruleStore.list(ctx.requestConfig, workspaceId, null),
			loadAccess(ctx, workspaceId),
		]);
		const pageIds = all
			.filter((rule) => rule?.resourceType === 'page' && rule.resourceId)
			.map((rule) => rule.resourceId);
		const rows = await readPageRows(ctx, pageIds);
		const readable = new Set();
		for (const id of rows.keys()) {
			if (levelOn(entry, rows.get(id), workspaceId, ctx.session.userId) !== 'none') readable.add(id);
		}
		const visible = all.filter((rule) => {
			if (rule?.resourceType !== 'page') return isAdmin;
			const id = rule.resourceId ? String(rule.resourceId).toLowerCase() : '';
			return id === '' || readable.has(id);
		});
		return reply(ctx.response, 200, { rules: visible, teamRules: true });
	};

	/** The resourceId form. A non-page/non-UUID id is 404 for everyone (C614); a UUID that
	 *  names no page may still be a database/block rule for the workspace owner/admin (C603). */
	const resourceRules = async (ctx, workspaceId, rawResourceId, inherited, isAdmin) => {
		const pageId = pageIdOf(rawResourceId);
		if (!pageId) return replyPageNotFound(ctx.response);
		// C601: the loader entry and the P row read start together, and BOTH are awaited, so an
		// unknown id and an unreadable page make the same upstream calls.
		const [entry, row] = await Promise.all([
			loadAccess(ctx, workspaceId, { forceMeta: inherited }),
			readPageRow(ctx, pageId),
		]);
		const level = levelOn(entry, row, workspaceId, ctx.session.userId);
		if (level === 'none') {
			// An existing page (foreign, private, denied) is a 404 for admins too: privacy beats
			// the workspace owner/admin exemption (F6). A missing UUID may be a non-page rule.
			// The admin read runs for an unreadable page as well as a missing one, so C601's
			// unknown/unreadable call sets stay equal; its answer is discarded when the row exists.
			if (!isAdmin) return replyPageNotFound(ctx.response);
			const fallback = await ruleStore.list(ctx.requestConfig, workspaceId, pageId);
			if (row) return replyPageNotFound(ctx.response);
			const own = fallback.filter((rule) => rule?.resourceType !== 'page');
			if (own.length === 0) return replyPageNotFound(ctx.response);
			return reply(ctx.response, 200, { rules: own, teamRules: true });
		}
		// C607: wide rules answer the resource form only to the workspace owner/admin.
		const rules = [
			...(entry.rulesByPage.get(pageId) ?? []),
			...(isAdmin ? entry.rulesByPage.get('') ?? [] : []),
		].map(toApiRule);
		const body = { rules, teamRules: true };
		if (inherited) Object.assign(body, await inheritedRules(ctx, entry, pageId, row, workspaceId));
		return reply(ctx.response, 200, body);
	};

	return async (ctx) => {
		const { method, tail, url, response, requestConfig } = ctx;
		if (method === 'GET' && tail === 'rules') {
			const workspaceId = url.searchParams.get('workspaceId');
			if (!workspaceId) return fail(response, 400);
			const resourceId = url.searchParams.get('resourceId');
			const inherited = url.searchParams.get('inherited') === '1';
			try {
				const workspace = await access(ctx, workspaceId, 'read');
				const isAdmin = workspace?.role === 'owner' || workspace?.role === 'admin';
				if (resourceId == null || resourceId === '') return await listVisibleRules(ctx, workspaceId, isAdmin);
				return await resourceRules(ctx, workspaceId, resourceId, inherited, isAdmin);
			} catch (error) {
				// C602: every failed access/rules/parent/page read is this 503, never a rules array.
				if ((Number(error?.status) || 500) >= 500) return replyAccessUnavailable(response);
				throw error;
			}
		}
		if (method === 'POST' && tail === 'rules') {
			const rule = normalizeShareRule(await readJsonBody(ctx.request));
			// A page owner may change the rules about their own page even when the
			// workspace membership alone would not (an owner who is only a viewer there);
			// a workspace-wide rule still needs the workspace owner/admin. The workspace
			// gate is therefore consulted but never allowed to throw before mayChangeRule
			// has had its say — mirrors DELETE below.
			const workspace = await access(ctx, rule.workspace_id, 'update').then((w) => w, () => null);
			const allowed = await mayChangeRule(ctx, rule, {
				fetchImpl, workspaceRole: workspace?.role, gated: Boolean(workspace), action: 'create',
				isMember: () => isMemberOf(ctx, rule.workspace_id, workspace),
			});
			if (!allowed) return fail(response, 403);
			const saved = await ruleStore.upsert(requestConfig, rule);
			reply(response, 200, { rule: saved });
			if (workspace) requestConfig.activity?.emit({ userId: workspace.userId }, 'share', 'editor', rule.workspace_id);
			return true;
		}
		if (method === 'DELETE' && tail.startsWith('rules/')) return deleteRule(ctx, decodeURIComponent(tail.slice('rules/'.length)));
		return undefined;
	};

	/** A page owner still in the workspace: the `update` gate already proves it, else a `read` one. */
	async function isMemberOf(ctx, workspaceId, updateGate) {
		if (updateGate) return true;
		return Boolean(await access(ctx, workspaceId, 'read').then((w) => w, () => null));
	}

	async function deleteRule(ctx, id) {
		const rule = await ruleStore.byId(ctx.requestConfig, id);
		if (!rule) return fail(ctx.response, 404);
		// The page owner may change the rules about their page even when the workspace
		// membership alone would not (an owner who is only a viewer there).
		const workspace = await access(ctx, rule.workspaceId, 'update').then((w) => w, () => null);
		const allowed = await mayChangeRule(ctx, rule, {
			fetchImpl, workspaceRole: workspace?.role, gated: Boolean(workspace), action: 'delete',
			isMember: () => isMemberOf(ctx, rule.workspaceId, workspace),
		});
		if (!allowed) return fail(ctx.response, 404);
		if (!(await ruleStore.remove(ctx.requestConfig, id, rule.workspaceId))) return fail(ctx.response, 404);
		return reply(ctx.response, 200, { deleted: true });
	}
}

export const PERMS_ROUTE_PREFIX = ROUTE_PREFIX;
