#!/usr/bin/env node
/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-api.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pagesToGraph } from './bridge-graph.mjs';
import { overviewRequest, mergeGraphs } from './bridge-graph-data.mjs';
import { pkColumnForEngine, recordNoteId, recordNotePageBody, recordSubitemNoteBody } from './bridge-records.mjs';
import { createAgentHandler } from './bridge-agent.mjs';
import { createConnectorHandler } from './bridge-connector.mjs';
import { createOAuthHandler } from './bridge-oauth.mjs';
import { createChatHandler } from './bridge-chat.mjs';
import { createNotifyHandler } from './bridge-notify.mjs';
import { createCollabHandler } from './bridge-collab.mjs';
import { createCommunityHandler } from './bridge-communities.mjs';
import { createFeedHandler } from './bridge-feed.mjs';
import { handlePermsRoute } from './bridge-perms.mjs';
import { createProfileHandler } from './bridge-profile.mjs';
import { createRtcTokenHandler } from './bridge-rtc.mjs';
import { createSocialHandler } from './bridge-social.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '..');

function readOptionalEnvFile(file) {
	if (!existsSync(file)) return '';
	try {
		return readFileSync(file, 'utf8');
	} catch (error) {
		if (error?.code === 'EACCES' || error?.code === 'ENOENT') {
			console.warn(`[osionos-bridge] skipped unreadable optional env file: ${file}`);
			return '';
		}
		throw error;
	}
}

for (const file of [
	resolve(APP_ROOT, '.env.local'),
	resolve(APP_ROOT, '.env'),
	resolve(APP_ROOT, '../../../.env.local'),
	resolve(APP_ROOT, '../../opposite-osiris/.env.local'),
	resolve(APP_ROOT, '../../opposite-osiris/.env'),
	resolve(APP_ROOT, '../../../apps/grobase/.env.local'),
]) {
	const envText = readOptionalEnvFile(file);
	if (!envText) continue;
	for (const rawLine of envText.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#') || !line.includes('=')) continue;
		const [key, ...valueParts] = line.split('=');
		let value = valueParts.join('=').trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
		if (key && process.env[key] === undefined) process.env[key] = value;
	}
}

const EMAIL_ATEXT = "A-Za-z0-9!#$%&'*+/=?^_`{|}~-";
const EMAIL_LOCAL_PART = String.raw`(?:[${EMAIL_ATEXT}]+(?:\.[${EMAIL_ATEXT}]+)*|"[^"\r\n]+")`;
const EMAIL_DOMAIN_LABEL = '(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)';
const EMAIL_REGEX = new RegExp(String.raw`^${EMAIL_LOCAL_PART}@(?>${EMAIL_DOMAIN_LABEL}\.)+[A-Za-z]{2,63}$`.replace('(?>', '(?:'));
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APP_SESSION_TOKEN_VERSION = 'osionos_v1';
const BRIDGE_FIELDS = new Set(['provider', 'subject', 'email', 'name', 'jti']);
const SENSITIVE_FIELD_PATTERN = /password|pass|secret|service|role|key|jwt|token|cookie|consent|birth|city|address|phone|profile|metadata|database|connection/i;
const DEFAULT_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_HANDOFF_TTL_MS = 90 * 1000;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60;
const DEFAULT_JSON_BODY_LIMIT_BYTES = 16_384;
const PAGE_JSON_BODY_LIMIT_BYTES = 6 * 1024 * 1024;
const DEFAULT_UNSPLASH_PER_PAGE = 12;
const MAX_UNSPLASH_PER_PAGE = 24;
const TRANSLATION_FETCH_TIMEOUT_MS = 6_000;
const BAAS_FETCH_TIMEOUT_MS = 2_500;
// The multi-engine graph overview pages tens of thousands of rows — needs headroom.
const GRAPH_FETCH_TIMEOUT_MS = 20_000;
const MAX_CLAUDE_TOOL_RESULT_TEXT = 120_000;
const PAGE_VISIBILITY_VALUES = new Set(['private', 'shared', 'public']);
const PAGE_SURFACE_VALUES = new Set(['page', 'agent', 'home', 'folder', 'wiki', 'app']);
// Shared, system-owned global marketplace (app records are surface 'app' under this database).
const MARKETPLACE_WORKSPACE_ID = '5a4b1c2d-1111-4111-8111-000000000001';
const MARKETPLACE_DATABASE_ID = '5a4b1c2d-2222-4222-8222-000000000002';
const MARKETPLACE_SYSTEM_USER = '5a4b1c2d-0000-4000-8000-000000000000';
const TRANSLATABLE_BLOCK_TYPES = new Set([
	'paragraph',
	'heading_1',
	'heading_2',
	'heading_3',
	'heading_4',
	'heading_5',
	'heading_6',
	'bulleted_list',
	'numbered_list',
	'to_do',
	'toggle',
	'quote',
	'callout',
	'image',
	'video',
	'audio',
	'file',
]);
const WORKSPACE_PERMISSIONS = new Set(['create', 'read', 'update', 'delete', 'admin']);
const CLAUDE_AGENT_VALUES = new Set(['general-purpose', 'Explore', 'Plan']);
const CLAUDE_MODEL_VALUES = new Set(['default', 'sonnet', 'opus', 'haiku']);
const CLAUDE_EFFORT_VALUES = new Set(['low', 'medium', 'high', 'xhigh']);
const CLAUDE_TOOL_MAP = {
	app: ['mcp__osionos__osionos_describe_app'],
	status: ['mcp__osionos__osionos_status'],
	workspace: ['mcp__osionos__osionos_list_workspaces'],
	list: ['mcp__osionos__osionos_list_pages'],
	search: ['mcp__osionos__osionos_search_pages'],
	read: ['mcp__osionos__osionos_read_page'],
	create: ['mcp__osionos__osionos_create_page'],
	update: ['mcp__osionos__osionos_update_page', 'mcp__osionos__osionos_append_to_page'],
	archive: ['mcp__osionos__osionos_archive_page'],
};

export function configFromEnv(env = process.env) {
	const appUrl = (env.OSIONOS_APP_URL ?? env.PUBLIC_OSIONOS_APP_URL ?? 'http://localhost:3001').replace(/\/$/, '');
	return {
		port: Number(env.OSIONOS_BRIDGE_PORT ?? 4000),
		appUrl,
		callbackPath: env.OSIONOS_BRIDGE_CALLBACK_PATH ?? '/',
		allowedOrigin: env.OSIONOS_ALLOWED_ORIGIN ?? appUrl,
		sharedSecret: env.OSIONOS_BRIDGE_SHARED_SECRET ?? '',
		appSessionSecret: env.OSIONOS_APP_SESSION_SECRET ?? '',
		baasUrl: (env.OSIONOS_BAAS_URL ?? env.PUBLIC_BAAS_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
		// Query-router is internal-only (no Kong route for /query/v1 graph); the bridge
		// reaches it by container DNS and authenticates with the tenant api-key, which
		// owner-scopes reads to the seeded business data.
		queryRouterUrl: (env.OSIONOS_QUERY_ROUTER_URL ?? 'http://mini-baas-query-router:4001').replace(/\/$/, ''),
		baasApiKey: env.OSIONOS_BAAS_API_KEY ?? env.BAAS_API_KEY ?? env.VITE_BAAS_API_KEY ?? '',
		// Adapter-registry lists the tenant's databases; it trusts X-Baas-Tenant-Id
		// (no Kong route works from the browser — anon key 401s on /admin/v1). The
		// tenant id is taken from env, or derived from the api-key via tenant-control.
		adapterRegistryUrl: (env.OSIONOS_ADAPTER_REGISTRY_URL ?? 'http://mini-baas-adapter-registry-go:3021').replace(/\/$/, ''),
		tenantControlUrl: (env.OSIONOS_TENANT_CONTROL_URL ?? 'http://mini-baas-tenant-control:3022').replace(/\/$/, ''),
		baasTenantId: env.OSIONOS_BAAS_TENANT_ID ?? env.VITE_BAAS_TENANT_ID ?? env.BAAS_TENANT_ID ?? '',
		gatewayUrl: (env.AUTH_GATEWAY_URL ?? 'http://auth-gateway:8787').replace(/\/$/, ''),
		publicApiKey: env.PUBLIC_BAAS_ANON_KEY ?? env.KONG_PUBLIC_API_KEY ?? '',
		serviceKey: env.SERVICE_ROLE_KEY ?? env.KONG_SERVICE_API_KEY ?? env.BAAS_SERVICE_ROLE_KEY ?? '',
		requireBaas: env.OSIONOS_BRIDGE_REQUIRE_BAAS === 'true',
		persistence: env.OSIONOS_BRIDGE_PERSISTENCE ?? 'auto',
		translationApiUrl: (env.OSIONOS_TRANSLATION_API_URL ?? env.VITE_TRANSLATION_API_URL ?? '').trim(),
		timestampSkewMs: Number(env.OSIONOS_BRIDGE_TIMESTAMP_SKEW_MS ?? DEFAULT_TIMESTAMP_SKEW_MS),
		handoffTtlMs: Number(env.OSIONOS_BRIDGE_HANDOFF_TTL_MS ?? DEFAULT_HANDOFF_TTL_MS),
		sessionTtlSeconds: Number(env.OSIONOS_APP_SESSION_TTL_SECONDS ?? DEFAULT_SESSION_TTL_SECONDS),
		emailHashSalt: env.OSIONOS_BRIDGE_EMAIL_HASH_SALT ?? env.OSIONOS_BRIDGE_SHARED_SECRET ?? 'osionos-local-email-hash',
		unsplashAccessKey: env.UNSPLASH_ACCESS_KEY ?? env.OSIONOS_UNSPLASH_ACCESS_KEY ?? '',
		// Account-level administrators. These emails are promoted to is_admin at
		// login (sticky in the DB, so the flag survives later env changes).
		adminEmails: (env.OSIONOS_ADMIN_EMAILS ?? 'dev.pro.photo@gmail.com')
			.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
	};
}

/** The dedicated admin workspace (seeded by osionos-admin-migration.sql). Admins
 *  are provisioned as members at login so its template pages ride the token. */
export const ADMIN_WORKSPACE_ID = '0a4d1c2e-0000-4000-8000-000000000ad1';

export function stableStringify(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	const entries = Object.keys(value)
		.sort((left, right) => left.localeCompare(right))
		.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key]));
	return '{' + entries.join(',') + '}';
}

export function bridgeSignature(secret, timestamp, payload) {
	return createHmac('sha256', secret).update(`${timestamp}.${stableStringify(payload)}`).digest('hex');
}

function base64url(input) {
	return Buffer.from(input).toString('base64url');
}

function randomToken() {
	return randomBytes(32).toString('base64url');
}

function safeCompareHex(left, right) {
	if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
	const leftBuffer = Buffer.from(left, 'hex');
	const rightBuffer = Buffer.from(right, 'hex');
	return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function safeCompareText(left, right) {
	const leftBuffer = Buffer.from(String(left ?? ''), 'utf8');
	const rightBuffer = Buffer.from(String(right ?? ''), 'utf8');
	return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function safeText(value, limit) {
	return String(value ?? '')
		.normalize('NFKC')
		.replaceAll(/[\u0000-\u001f\u007f]/g, '')
		.trim()
		.slice(0, limit);
}

function slugify(value, fallback) {
	return safeText(value, 80).toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '') || fallback;
}

function uuidFromHash(value) {
	const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
	hex[12] = '5';
	hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
	return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

function emailHash(email, config) {
	return createHmac('sha256', config.emailHashSalt).update(email).digest('hex');
}

function requireUuid(value, fieldName) {
	const normalized = safeText(value, 80);
	if (!UUID_REGEX.test(normalized)) throw Object.assign(new Error(`${fieldName} must be a UUID.`), { status: 422 });
	return normalized;
}

function requirePageReference(value) {
	const normalized = safeText(value, 220);
	if (!normalized) throw Object.assign(new Error('pageId is required.'), { status: 422 });
	return normalized;
}

function optionalUuid(value, fieldName) {
	if (value === null) return null;
	if (value === undefined || value === '') return undefined;
	return requireUuid(value, fieldName);
}

function hasOwn(value, key) {
	return Object.hasOwn(value, key);
}

function safeJsonArray(value, fallback = []) {
	return Array.isArray(value) ? value : fallback;
}

function safeJsonObject(value, fieldName, fallback = {}) {
	if (value === undefined) return fallback;
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw Object.assign(new Error(`${fieldName} must be an object.`), { status: 422 });
	}
	return value;
}

function safeTimestampOrNull(value, fieldName) {
	if (value === null || value === '') return null;
	const timestamp = safeText(value, 64);
	if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
		throw Object.assign(new Error(`${fieldName} must be an ISO timestamp or null.`), { status: 422 });
	}
	return new Date(timestamp).toISOString();
}

const PAGE_RECURRENCE_EVERY = new Set(['none', 'day', 'week', 'month']);

/** Normalize a template recurrence config to a safe jsonb value, or null. */
function safeRecurrence(value) {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'object' || Array.isArray(value)) return null;
	const every = PAGE_RECURRENCE_EVERY.has(value.every) ? value.every : 'none';
	if (every === 'none') return { every: 'none' };
	return {
		every,
		nextDueAt: safeTimestampOrNull(value.nextDueAt ?? null, 'recurrence.nextDueAt'),
		lastRunAt: safeTimestampOrNull(value.lastRunAt ?? null, 'recurrence.lastRunAt'),
	};
}

function normalizePermission(value) {
	const permission = safeText(value, 16) || 'read';
	return WORKSPACE_PERMISSIONS.has(permission) ? permission : 'read';
}

function responseStatusForBaasFailure(status) {
	if (status === 401 || status === 403) return 403;
	if (status === 404) return 404;
	return 502;
}

function assignPayloadValue(row, payload, payloadKey, rowKey, mapper) {
	if (hasOwn(payload, payloadKey)) row[rowKey] = mapper(payload[payloadKey]);
}

function textOrNull(value, limit) {
	return safeText(value, limit) || null;
}

function nullablePostgrestFilter(value, mapper = (item) => safeText(item, 160)) {
	if (value === undefined) return undefined;
	if (value === null) return 'is.null';
	return `eq.${mapper(value)}`;
}

export function validateBridgePayload(payload) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		throw Object.assign(new Error('Bridge payload must be an object.'), { status: 422 });
	}
	const keys = Object.keys(payload);
	for (const key of keys) {
		if (!BRIDGE_FIELDS.has(key)) {
			const message = SENSITIVE_FIELD_PATTERN.test(key) ? 'Sensitive bridge field rejected.' : 'Unexpected bridge field rejected.';
			throw Object.assign(new Error(message), { status: 422 });
		}
	}
	const provider = safeText(payload.provider, 32);
	const subject = safeText(payload.subject, 80);
	const email = safeText(payload.email, 320).toLowerCase();
	const name = safeText(payload.name, 80) || email.split('@')[0];
	const jti = safeText(payload.jti, 80);
	if (provider !== 'prismatica') throw Object.assign(new Error('Unsupported identity provider.'), { status: 422 });
	if (!UUID_REGEX.test(subject)) throw Object.assign(new Error('Bridge subject must be a Prismatica UUID.'), { status: 422 });
	if (!EMAIL_REGEX.test(email)) throw Object.assign(new Error('Bridge email is invalid.'), { status: 422 });
	if (!UUID_REGEX.test(jti)) throw Object.assign(new Error('Bridge jti must be a UUID.'), { status: 422 });
	return { provider, subject, email, name, jti };
}

function pruneExpiringMap(map, now) {
	for (const [key, value] of map.entries()) {
		if (value.expiresAt <= now) map.delete(key);
	}
}

export function verifyBridgeRequest({ headers, payload, secret, now = Date.now(), timestampSkewMs = DEFAULT_TIMESTAMP_SKEW_MS, replayStore = new Map() }) {
	if (!secret) throw Object.assign(new Error('osionos bridge secret is not configured.'), { status: 503 });
	const timestampHeader = headers['x-prismatica-bridge-timestamp'] ?? headers['X-Prismatica-Bridge-Timestamp'];
	const signatureHeader = headers['x-prismatica-bridge-signature'] ?? headers['X-Prismatica-Bridge-Signature'];
	const timestamp = Number(timestampHeader);
	if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > timestampSkewMs) {
		throw Object.assign(new Error('Bridge assertion timestamp is outside the allowed window.'), { status: 401 });
	}
	const normalizedPayload = validateBridgePayload(payload);
	const expected = bridgeSignature(secret, String(timestampHeader), normalizedPayload);
	if (typeof signatureHeader !== 'string' || !safeCompareHex(expected, signatureHeader)) {
		throw Object.assign(new Error('Bridge signature is invalid.'), { status: 401 });
	}
	pruneExpiringMap(replayStore, now);
	if (replayStore.has(normalizedPayload.jti)) {
		throw Object.assign(new Error('Bridge assertion replay rejected.'), { status: 409 });
	}
	replayStore.set(normalizedPayload.jti, { expiresAt: now + timestampSkewMs });
	return normalizedPayload;
}

export function signAppSessionToken({ payload, workspace, config, now = Date.now(), jti = randomUUID(), memberWorkspaces = [], isAdmin = false }) {
	if (!config.appSessionSecret) throw Object.assign(new Error('osionos app session secret is not configured.'), { status: 503 });
	const iat = Math.floor(now / 1000);
	const exp = iat + config.sessionTtlSeconds;
	const memberRoles = Object.fromEntries(memberWorkspaces.map((entry) => [entry._id, safeText(entry.role, 16) || 'member']));
	const tokenPayload = {
		iss: 'osionos-bridge',
		aud: 'osionos-app',
		sub: payload.subject,
		provider: payload.provider,
		workspace_ids: [workspace._id, ...memberWorkspaces.map((entry) => entry._id)],
		roles: { ...memberRoles, [workspace._id]: 'owner' },
		is_admin: isAdmin === true,
		jti,
		iat,
		exp,
	};
	const encodedPayload = base64url(JSON.stringify(tokenPayload));
	const signature = createHmac('sha256', config.appSessionSecret).update(encodedPayload).digest('base64url');
	return { token: `osionos_v1.${encodedPayload}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyAppSessionToken(token, config, now = Date.now()) {
	if (!config.appSessionSecret) throw Object.assign(new Error('osionos app session secret is not configured.'), { status: 503 });
	const [version, encodedPayload, signature, extra] = safeText(token, 4096).split('.');
	if (version !== APP_SESSION_TOKEN_VERSION || !encodedPayload || !signature || extra !== undefined) {
		throw Object.assign(new Error('App session token is invalid.'), { status: 401 });
	}
	const expectedSignature = createHmac('sha256', config.appSessionSecret).update(encodedPayload).digest('base64url');
	if (!safeCompareText(signature, expectedSignature)) {
		throw Object.assign(new Error('App session token signature is invalid.'), { status: 401 });
	}

	let payload;
	try {
		payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
	} catch {
		throw Object.assign(new Error('App session token payload is invalid.'), { status: 401 });
	}

	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		throw Object.assign(new Error('App session token payload is invalid.'), { status: 401 });
	}
	if (payload.iss !== 'osionos-bridge' || payload.aud !== 'osionos-app') {
		throw Object.assign(new Error('App session token audience is invalid.'), { status: 401 });
	}
	if (!UUID_REGEX.test(String(payload.sub ?? ''))) {
		throw Object.assign(new Error('App session token subject is invalid.'), { status: 401 });
	}
	const exp = Number(payload.exp);
	if (!Number.isFinite(exp) || exp <= Math.floor(now / 1000)) {
		throw Object.assign(new Error('App session token has expired.'), { status: 401 });
	}
	const workspaceIds = Array.isArray(payload.workspace_ids)
		? payload.workspace_ids.map(String).filter((workspaceId) => UUID_REGEX.test(workspaceId))
		: [];
	if (workspaceIds.length === 0) {
		throw Object.assign(new Error('App session token has no workspace access.'), { status: 401 });
	}
	return {
		userId: String(payload.sub),
		workspaceIds,
		roles: payload.roles && typeof payload.roles === 'object' && !Array.isArray(payload.roles) ? payload.roles : {},
		isAdmin: payload.is_admin === true,
		raw: payload,
	};
}

function bearerToken(request) {
	const header = String(request.headers.authorization ?? request.headers.Authorization ?? '');
	const match = /^Bearer\s+(.+)$/i.exec(header);
	if (!match) throw Object.assign(new Error('App session bearer token is required.'), { status: 401 });
	return match[1].trim();
}

function requireBaasConfig(config) {
	if (!config.baasUrl || !config.serviceKey) {
		throw Object.assign(new Error('osionos BaaS service-role access is not configured.'), { status: 503 });
	}
}

async function baasRest(config, fetchImpl, path, { method = 'GET', body, prefer } = {}) {
	requireBaasConfig(config);
	const headers = {
		Accept: 'application/json',
		apikey: config.serviceKey,
		Authorization: `Bearer ${config.serviceKey}`,
	};
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	if (prefer) headers.Prefer = prefer;

	const response = await fetchWithTimeout(fetchImpl, `${config.baasUrl}/rest/v1/${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	}, BAAS_FETCH_TIMEOUT_MS);
	const text = await response.text().catch(() => '');
	if (!response.ok) {
		const status = responseStatusForBaasFailure(response.status);
		throw Object.assign(new Error(`BaaS request failed with ${response.status}: ${text.slice(0, 160)}`), { status });
	}
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/**
 * POST to the grobase query-router (internal-only, NOT via Kong) with the tenant
 * api-key. Used by the data graph: the api-key resolves to the tenant + owner-scopes
 * the read to the seeded business records. 503 if the key/url aren't configured.
 */
async function baasQueryPost(config, fetchImpl, path, body, timeoutMs = BAAS_FETCH_TIMEOUT_MS) {
	if (!config.queryRouterUrl || !config.baasApiKey) {
		throw Object.assign(new Error('osionos query-router access is not configured.'), { status: 503 });
	}
	const response = await fetchWithTimeout(fetchImpl, `${config.queryRouterUrl}${path}`, {
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Baas-Api-Key': config.baasApiKey },
		body: JSON.stringify(body),
	}, timeoutMs);
	const text = await response.text().catch(() => '');
	if (!response.ok) {
		const status = responseStatusForBaasFailure(response.status);
		throw Object.assign(new Error(`query-router request failed with ${response.status}: ${text.slice(0, 160)}`), { status });
	}
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** GET from the query-router (internal-only) with the tenant api-key. Sibling of
 *  baasQueryPost for read-only routes like /:dbId/schema. */
async function baasQueryGet(config, fetchImpl, path, timeoutMs = BAAS_FETCH_TIMEOUT_MS) {
	if (!config.queryRouterUrl || !config.baasApiKey) {
		throw Object.assign(new Error('osionos query-router access is not configured.'), { status: 503 });
	}
	const response = await fetchWithTimeout(fetchImpl, `${config.queryRouterUrl}${path}`, {
		method: 'GET',
		headers: { Accept: 'application/json', 'X-Baas-Api-Key': config.baasApiKey },
	}, timeoutMs);
	const text = await response.text().catch(() => '');
	if (!response.ok) {
		const status = responseStatusForBaasFailure(response.status);
		throw Object.assign(new Error(`query-router request failed with ${response.status}: ${text.slice(0, 160)}`), { status });
	}
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** POST to the query-router and return its RAW {status, body} verbatim. WRITES
 *  (insert/update/delete/upsert/txn/ddl) must NOT be coerced — liveWriteClient
 *  classifies each by status (200 ok / 409 conflict / 422 rejected / 5xx fail),
 *  so the upstream status + body pass straight through. */
async function baasQueryPassthrough(config, fetchImpl, path, body, timeoutMs = BAAS_FETCH_TIMEOUT_MS) {
	if (!config.queryRouterUrl || !config.baasApiKey) {
		return { status: 503, body: { ok: false, message: 'osionos query-router access is not configured.' } };
	}
	let response;
	try {
		response = await fetchWithTimeout(fetchImpl, `${config.queryRouterUrl}${path}`, {
			method: 'POST',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Baas-Api-Key': config.baasApiKey },
			body: JSON.stringify(body),
		}, timeoutMs);
	} catch (error) {
		return { status: 502, body: { ok: false, message: error instanceof Error ? error.message : String(error) } };
	}
	const text = await response.text().catch(() => '');
	let parsed = null;
	if (text) {
		try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
	}
	return { status: response.status, body: parsed };
}

/** GET the tenant's databases from the adapter-registry (internal-only). The
 *  registry trusts the X-Baas-Tenant-Id header and RLS-scopes to that tenant. */
async function baasRegistryGet(config, fetchImpl, path, tenantId, timeoutMs = BAAS_FETCH_TIMEOUT_MS) {
	if (!config.adapterRegistryUrl || !tenantId) {
		throw Object.assign(new Error('osionos adapter-registry tenant id is not configured (set OSIONOS_BAAS_TENANT_ID).'), { status: 503 });
	}
	const response = await fetchWithTimeout(fetchImpl, `${config.adapterRegistryUrl}${path}`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			'X-Baas-Tenant-Id': tenantId,
			// The registry RLS maps auth.uid() from the user header, and the rows are
			// owned by the grobase TENANT — so the user header must be the tenant id,
			// NOT the osionos app-session user (who owns nothing here → empty list,
			// which used to silently degrade the panel to the env mock mounts).
			'X-Baas-User-Id': tenantId,
		},
	}, timeoutMs);
	const text = await response.text().catch(() => '');
	if (!response.ok) {
		const status = responseStatusForBaasFailure(response.status);
		throw Object.assign(new Error(`adapter-registry request failed with ${response.status}: ${text.slice(0, 160)}`), { status });
	}
	if (!text) return [];
	try {
		return JSON.parse(text);
	} catch {
		return [];
	}
}

function postgrestQuery(params) {
	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null && value !== '') searchParams.set(key, value);
	}
	return searchParams.toString();
}

function pageRowToEntry(row) {
	return {
		_id: row.id,
		title: typeof row.title === 'string' && row.title ? row.title : 'Untitled',
		icon: row.icon ?? undefined,
		cover: row.cover ?? undefined,
		updatedAt: row.updated_at ?? row.created_at ?? undefined,
		workspaceId: row.workspace_id,
		ownerId: row.owner_id ?? null,
		visibility: PAGE_VISIBILITY_VALUES.has(row.visibility) ? row.visibility : 'private',
		collaborators: safeJsonArray(row.collaborators),
		parentPageId: row.parent_page_id ?? null,
		sortOrder: typeof row.sort_order === 'number' ? row.sort_order : null,
		databaseId: row.database_id ?? null,
		archivedAt: row.archived_at ?? null,
		content: safeJsonArray(row.content),
		properties: safeJsonArray(row.properties),
		surface: PAGE_SURFACE_VALUES.has(row.surface) ? row.surface : undefined,
		isTemplate: row.is_template === true,
		isDefaultTemplate: row.is_default_template === true,
		templateSurface: row.template_surface === 'profile' || row.template_surface === 'marketplace-app' ? row.template_surface : undefined,
		recurrence: safeRecurrence(row.recurrence),
	};
}

function workspaceRowToEntry(row, member = {}) {
	const settings = row?.settings && typeof row.settings === 'object' && !Array.isArray(row.settings) ? row.settings : {};
	return {
		_id: row.id,
		id: row.id,
		name: typeof row.name === 'string' && row.name ? row.name : 'osionos workspace',
		slug: typeof row.slug === 'string' ? row.slug : '',
		ownerId: row.owner_id,
		plan: typeof settings.plan === 'string' ? settings.plan : 'Bridge',
		settings,
		role: safeText(member.role, 16) || undefined,
		permissions: Array.isArray(member.permissions) ? member.permissions.filter((item) => typeof item === 'string') : undefined,
		createdAt: row.created_at ?? undefined,
		updatedAt: row.updated_at ?? undefined,
	};
}

function fallbackWorkspaceEntry(workspaceId, authContext) {
	return {
		_id: workspaceId,
		id: workspaceId,
		name: 'Claude MCP osionos',
		slug: `mcp-${workspaceId.slice(0, 8)}`,
		ownerId: authContext.userId,
		plan: 'Bridge',
		settings: {
			bridgeProvider: 'prismatica',
			role: 'owner',
			permissions: ['create', 'read', 'update', 'delete', 'admin'],
			plan: 'Bridge',
			memberCount: 1,
		},
		role: 'owner',
		permissions: ['create', 'read', 'update', 'delete', 'admin'],
	};
}

function pageRowsToEntries(rows) {
	return Array.isArray(rows) ? rows.map(pageRowToEntry) : [];
}

function pageCreateRowFromPayload(payload, authContext) {
	const workspaceId = requireUuid(payload.workspaceId, 'workspaceId');
	const parentPageId = optionalUuid(payload.parentPageId, 'parentPageId');
	const databaseId = hasOwn(payload, 'databaseId') && payload.databaseId !== null ? safeText(payload.databaseId, 160) || null : null;
	const visibility = PAGE_VISIBILITY_VALUES.has(payload.visibility) ? payload.visibility : 'private';
	const surface = PAGE_SURFACE_VALUES.has(payload.surface) ? payload.surface : null;
	const row = {
		workspace_id: workspaceId,
		parent_page_id: parentPageId === undefined ? null : parentPageId,
		sort_order: typeof payload.sortOrder === 'number' ? payload.sortOrder : null,
		owner_id: authContext.userId,
		title: safeText(payload.title, 200) || 'Untitled',
		icon: hasOwn(payload, 'icon') ? (safeText(payload.icon, 80) || null) : null,
		cover: hasOwn(payload, 'cover') ? (safeText(payload.cover, 1024) || null) : null,
		database_id: databaseId,
		surface,
		visibility,
		collaborators: safeJsonArray(payload.collaborators),
		properties: safeJsonArray(payload.properties),
		content: safeJsonArray(payload.content),
	};
	// Only attach template columns for template creates, so a backend whose schema
	// predates the template migration still accepts ordinary page inserts.
	if (payload.isTemplate === true || payload.isDefaultTemplate === true || payload.recurrence || payload.templateSurface) {
		row.is_template = payload.isTemplate === true;
		row.is_default_template = payload.isDefaultTemplate === true;
		row.recurrence = safeRecurrence(payload.recurrence);
		if (payload.templateSurface === 'profile' || payload.templateSurface === 'marketplace-app') {
			row.template_surface = payload.templateSurface;
		}
	}
	return row;
}

function pageUpdateRowFromPayload(payload) {
	const row = { updated_at: new Date().toISOString() };
	assignPayloadValue(row, payload, 'workspaceId', 'workspace_id', (value) => requireUuid(value, 'workspaceId'));
	assignPayloadValue(row, payload, 'parentPageId', 'parent_page_id', (value) => optionalUuid(value, 'parentPageId') ?? null);
	assignPayloadValue(row, payload, 'sortOrder', 'sort_order', (value) => typeof value === 'number' ? value : null);
	assignPayloadValue(row, payload, 'title', 'title', (value) => safeText(value, 200) || 'Untitled');
	assignPayloadValue(row, payload, 'icon', 'icon', (value) => textOrNull(value, 80));
	assignPayloadValue(row, payload, 'cover', 'cover', (value) => textOrNull(value, 1024));
	assignPayloadValue(row, payload, 'databaseId', 'database_id', (value) => value === null ? null : textOrNull(value, 160));
	assignPayloadValue(row, payload, 'surface', 'surface', (value) => PAGE_SURFACE_VALUES.has(value) ? value : null);
	assignPayloadValue(row, payload, 'visibility', 'visibility', (value) => PAGE_VISIBILITY_VALUES.has(value) ? value : 'private');
	assignPayloadValue(row, payload, 'collaborators', 'collaborators', (value) => safeJsonArray(value));
	assignPayloadValue(row, payload, 'properties', 'properties', (value) => safeJsonArray(value));
	assignPayloadValue(row, payload, 'content', 'content', (value) => safeJsonArray(value));
	assignPayloadValue(row, payload, 'archivedAt', 'archived_at', (value) => safeTimestampOrNull(value, 'archivedAt'));
	assignPayloadValue(row, payload, 'isTemplate', 'is_template', (value) => value === true);
	assignPayloadValue(row, payload, 'isDefaultTemplate', 'is_default_template', (value) => value === true);
	assignPayloadValue(row, payload, 'templateSurface', 'template_surface', (value) => (value === 'profile' || value === 'marketplace-app') ? value : null);
	assignPayloadValue(row, payload, 'recurrence', 'recurrence', (value) => safeRecurrence(value));
	return row;
}

function memberHasPermission(member, permission) {
	if (!member) return false;
	const role = safeText(member.role, 16);
	if (role === 'owner' || role === 'admin') return true;
	const permissions = Array.isArray(member.permissions) ? member.permissions.filter((item) => typeof item === 'string') : [];
	return permissions.includes('admin') || permissions.includes(permission);
}

/**
 * Page-level authorization (defence in depth on top of requireWorkspaceAccess). A page
 * may be mutated by its OWNER, a workspace owner/admin, a workspace member holding the
 * 'update' permission (org/teamspace editors — parity with the client's canEditPage rule
 * now that sessions carry shared workspaces), or an explicit page collaborator with
 * editor/owner role. Read-only members (viewer role) are already rejected by the
 * requireWorkspaceAccess permission gate before this runs.
 */
function requirePageOwnership(existing, access) {
	const ownProps = Array.isArray(existing.properties) ? existing.properties : [];
	const isPublished = ownProps.some((p) => p && p.key === 'published' && (p.value === true || p.value === 'true'));
	if (!isPublished && existing.owner_id == null) return; // legacy / unowned page — the workspace gate suffices (NOT for published apps)
	if (existing.owner_id === access.userId) return; // the page owner
	if (access.role === 'owner' || access.role === 'admin') return; // workspace owner/admin
	if (Array.isArray(access.permissions) && access.permissions.includes('update')) return; // shared-workspace editor
	const collaborators = Array.isArray(existing.collaborators) ? existing.collaborators : [];
	const role = collaborators.find((entry) => entry && entry.userId === access.userId)?.role;
	if (role === 'editor' || role === 'owner') return; // explicit page collaborator
	throw Object.assign(new Error('You do not have permission to modify this page.'), { status: 403 });
}

/** osionos_workspace_members row for (user, workspace) — org/teamspace membership. */
async function workspaceMemberRow(userId, workspaceId, config, fetchImpl) {
	const query = postgrestQuery({
		workspace_id: `eq.${workspaceId}`,
		user_id: `eq.${userId}`,
		select: 'role,permissions',
		limit: '1',
	});
	const rows = await baasRest(config, fetchImpl, `osionos_workspace_members?${query}`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

export async function requireWorkspaceAccess(request, workspaceId, permission, config, fetchImpl = fetch) {
	const normalizedWorkspaceId = requireUuid(workspaceId, 'workspaceId');
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	if (!authContext.workspaceIds.includes(normalizedWorkspaceId)) {
		// Org/teamspace membership lives in osionos_workspace_members — the app
		// token only carries the user's PRIVATE workspace. Consult the members
		// table (like /api/chat does) before rejecting; deny on any miss.
		const member = await workspaceMemberRow(authContext.userId, normalizedWorkspaceId, config, fetchImpl).catch(() => null);
		if (!member || !memberHasPermission(member, normalizePermission(permission))) {
			throw Object.assign(new Error('App session is not scoped to this workspace.'), { status: 403 });
		}
		return {
			...authContext,
			workspaceId: normalizedWorkspaceId,
			role: safeText(member.role, 16),
			permissions: Array.isArray(member.permissions) ? member.permissions.filter((item) => typeof item === 'string') : [],
		};
	}
	const workspaces = await listSessionWorkspaces(authContext, config, fetchImpl);
	const workspace = workspaces.find((item) => item._id === normalizedWorkspaceId || item.id === normalizedWorkspaceId);
	const member = workspace ? { role: workspace.role, permissions: workspace.permissions } : null;
	const requiredPermission = normalizePermission(permission);
	if (!memberHasPermission(member, requiredPermission)) {
		throw Object.assign(new Error('Workspace permission denied.'), { status: 403 });
	}
	return {
		...authContext,
		workspaceId: normalizedWorkspaceId,
		role: safeText(member.role, 16),
		permissions: Array.isArray(member.permissions) ? member.permissions.filter((item) => typeof item === 'string') : [],
	};
}

async function fetchPageRow(pageId, config, fetchImpl) {
	const id = requireUuid(pageId, 'pageId');
	const query = postgrestQuery({ id: `eq.${id}`, select: '*', limit: '1' });
	const rows = await baasRest(config, fetchImpl, `osionos_pages?${query}`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function fetchPageRowIfUuid(pageId, config, fetchImpl) {
	if (!UUID_REGEX.test(pageId)) return null;
	return fetchPageRow(pageId, config, fetchImpl);
}

async function fetchPageConfigRow(pageId, userId, config, fetchImpl) {
	const query = postgrestQuery({
		page_id: `eq.${requirePageReference(pageId)}`,
		user_id: `eq.${requireUuid(userId, 'userId')}`,
		select: 'config,updated_at',
		limit: '1',
	});
	const rows = await baasRest(config, fetchImpl, `osionos_page_configurations?${query}`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/**
 * A page's OWNER may always access it, even when the workspace-membership gate
 * would deny — e.g. a record-note that landed in a read-only seed workspace the
 * user reaches via the MOUNT but not via that workspace's page role. Non-owners
 * still go through requireWorkspaceAccess. `owner_id` is server-stamped, so this
 * never widens cross-user access.
 */
async function ownerOrWorkspaceAccess(request, row, permission, config, fetchImpl = fetch) {
	const token = verifyAppSessionToken(bearerToken(request), config);
	if (row && row.owner_id && row.owner_id === token.userId) {
		return { ...token, workspaceId: row.workspace_id, role: 'owner', permissions: ['create', 'read', 'update', 'delete'] };
	}
	return requireWorkspaceAccess(request, row.workspace_id, permission, config, fetchImpl);
}

async function requirePageScopeAccess(request, pageId, payload, permission, config, fetchImpl = fetch) {
	const normalizedPageId = requirePageReference(pageId);
	const row = await fetchPageRowIfUuid(normalizedPageId, config, fetchImpl);
	if (row) {
		const authContext = await ownerOrWorkspaceAccess(request, row, permission, config, fetchImpl);
		return { pageId: normalizedPageId, workspaceId: row.workspace_id, authContext, row };
	}

	const tokenContext = verifyAppSessionToken(bearerToken(request), config);
	const requestedWorkspaceId = UUID_REGEX.test(String(payload?.workspaceId ?? '')) ? String(payload.workspaceId) : '';
	const workspaceId = requestedWorkspaceId && tokenContext.workspaceIds.includes(requestedWorkspaceId)
		? requestedWorkspaceId
		: tokenContext.workspaceIds[0];
	const authContext = await requireWorkspaceAccess(request, workspaceId, permission, config, fetchImpl);
	return { pageId: normalizedPageId, workspaceId, authContext, row: null };
}

async function listPageRows(workspaceId, config, fetchImpl, filters = {}) {
	const query = postgrestQuery({
		workspace_id: `eq.${workspaceId}`,
		database_id: nullablePostgrestFilter(filters.databaseId),
		parent_page_id: nullablePostgrestFilter(filters.parentPageId, (value) => requireUuid(value, 'parentPageId')),
		surface: filters.surface ? `eq.${filters.surface}` : undefined,
		select: '*',
		order: 'updated_at.desc',
	});
	return await baasRest(config, fetchImpl, `osionos_pages?${query}`) ?? [];
}

async function listWorkspacePageRefs(workspaceId, config, fetchImpl) {
	const query = postgrestQuery({ workspace_id: `eq.${workspaceId}`, select: 'id,parent_page_id' });
	return await baasRest(config, fetchImpl, `osionos_pages?${query}`) ?? [];
}

async function listSessionWorkspaces(authContext, config, fetchImpl) {
	if (authContext.workspaceIds.length === 0) return [];
	try {
		const rows = await baasRest(config, fetchImpl, 'rpc/osionos_bridge_list_workspaces', {
			method: 'POST',
			body: {
				p_user_id: authContext.userId,
				p_workspace_ids: authContext.workspaceIds,
			},
		});
		const workspaces = (Array.isArray(rows) ? rows : []).map((row) => workspaceRowToEntry({
			id: row.workspace_id,
			owner_id: row.owner_id,
			name: row.workspace_name,
			slug: row.workspace_slug,
			settings: row.workspace_settings,
			created_at: row.created_at,
			updated_at: row.updated_at,
		}, {
			role: row.workspace_role,
			permissions: row.permissions,
		}));
		return workspaces.length > 0 ? workspaces : authContext.workspaceIds.map((workspaceId) => fallbackWorkspaceEntry(workspaceId, authContext));
	} catch (error) {
		if (config.requireBaas) throw error;
		console.warn(`[osionos-bridge] workspace list fell back to session scope: ${error instanceof Error ? error.message : 'unknown error'}`);
		return authContext.workspaceIds.map((workspaceId) => fallbackWorkspaceEntry(workspaceId, authContext));
	}
}

function descendantPageIds(rows, parentId) {
	const childrenByParent = new Map();
	for (const row of rows) {
		if (!row.parent_page_id) continue;
		const children = childrenByParent.get(row.parent_page_id) ?? [];
		children.push(row.id);
		childrenByParent.set(row.parent_page_id, children);
	}
	const result = [];
	const pending = [...(childrenByParent.get(parentId) ?? [])];
	const seen = new Set([parentId]);
	while (pending.length > 0) {
		const id = pending.shift();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		result.push(id);
		pending.push(...(childrenByParent.get(id) ?? []));
	}
	return result;
}

function idsFilter(ids) {
	return `id=in.(${ids.map((id) => encodeURIComponent(id)).join(',')})`;
}

export async function persistBridgeIdentity(payload, config, fetchImpl = fetch) {
	const persistenceEnabled = config.persistence === 'baas' || (config.persistence === 'auto' && config.serviceKey && config.baasUrl);
	if (!persistenceEnabled) return null;
	const response = await fetchWithTimeout(fetchImpl, `${config.baasUrl}/rest/v1/rpc/osionos_bridge_upsert_workspace`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			apikey: config.serviceKey || config.publicApiKey,
			Authorization: `Bearer ${config.serviceKey}`,
		},
		body: JSON.stringify({
			p_provider: payload.provider,
			p_subject: payload.subject,
			p_email_hash: emailHash(payload.email, config),
			p_display_name: payload.name,
		}),
	}, BAAS_FETCH_TIMEOUT_MS);
	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw Object.assign(new Error(`BaaS bridge persistence failed with ${response.status}: ${body.slice(0, 160)}`), { status: 502 });
	}
	const body = await response.json().catch(() => null);
	const row = Array.isArray(body) ? body[0] : body;
	if (!row || typeof row !== 'object') return null;
	return {
		workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : undefined,
		workspaceName: typeof row.workspace_name === 'string' ? row.workspace_name : undefined,
		workspaceSlug: typeof row.workspace_slug === 'string' ? row.workspace_slug : undefined,
	};
}

export function createUserSession(payload, config, persisted = null, now = Date.now(), memberWorkspaces = [], isAdmin = false) {
	const userId = payload.subject;
	const fallbackWorkspaceId = uuidFromHash(`osionos-workspace:${payload.provider}:${payload.subject}`);
	const workspaceName = persisted?.workspaceName ?? `${payload.name}'s osionos`;
	const workspace = {
		_id: persisted?.workspaceId ?? fallbackWorkspaceId,
		name: workspaceName,
		slug: persisted?.workspaceSlug ?? slugify(workspaceName, `workspace-${userId.slice(0, 8)}`),
		ownerId: userId,
		memberIds: [userId],
		settings: {
			bridgeProvider: payload.provider,
			role: 'owner',
			permissions: ['create', 'read', 'update', 'delete', 'admin'],
			plan: 'Bridge',
			memberCount: 1,
		},
	};
	// Org/teamspace workspaces (osionos_workspace_members) ride along so the
	// app can hydrate + switch to them; owned ones stay private, rest shared.
	const extras = memberWorkspaces.filter((entry) => entry?._id && entry._id !== workspace._id);
	const { token, expiresAt } = signAppSessionToken({ payload, workspace, config, now, memberWorkspaces: extras, isAdmin });
	return {
		expiresAt,
		persona: {
			id: userId,
			email: payload.email,
			password: '',
			name: payload.name,
			emoji: '◈',
			roleBadge: 'Owner',
			persistInSessions: true,
			workspaceIds: [workspace._id, ...extras.map((entry) => entry._id)],
		},
		session: {
			userId,
			accessToken: token,
			refreshToken: '',
			privateWorkspaces: [workspace, ...extras.filter((entry) => entry.ownerId === userId)],
			sharedWorkspaces: extras.filter((entry) => entry.ownerId !== userId),
		},
	};
}

/**
 * Org/teamspace workspaces for session enrichment — RPC-backed ONLY (no
 * fallback synthesis: a workspace appears here iff an osionos_workspace_members
 * row exists). Best-effort: any failure yields [] and the handoff proceeds.
 */
async function memberWorkspaceEntries(userId, excludeIds, config, fetchImpl) {
	try {
		const ids = (await memberWorkspaceIds(userId, config, fetchImpl)).filter((id) => !excludeIds.includes(id));
		if (ids.length === 0) return [];
		const rows = await baasRest(config, fetchImpl, 'rpc/osionos_bridge_list_workspaces', {
			method: 'POST',
			body: { p_user_id: userId, p_workspace_ids: ids },
		});
		return (Array.isArray(rows) ? rows : []).map((row) => workspaceRowToEntry({
			id: row.workspace_id,
			owner_id: row.owner_id,
			name: row.workspace_name,
			slug: row.workspace_slug,
			settings: row.workspace_settings,
			created_at: row.created_at,
			updated_at: row.updated_at,
		}, {
			role: row.workspace_role,
			permissions: row.permissions,
		}));
	} catch {
		return [];
	}
}

/**
 * Resolve the account-level admin flag for a login. Promotes configured admin
 * emails (sticky — only ever sets true) and reads the PERSISTED flag back, so
 * admin status survives later removal of OSIONOS_ADMIN_EMAILS. Fail-safe: any
 * error degrades to the env-only answer (never throws, never blocks login).
 */
async function resolveAdminFlag(payload, config, fetchImpl) {
	const isAdminEmail = config.adminEmails.includes(String(payload.email ?? '').toLowerCase());
	if (!config.serviceKey || !config.baasUrl) return isAdminEmail;
	const hash = encodeURIComponent(emailHash(payload.email, config));
	try {
		if (isAdminEmail) {
			await baasRest(config, fetchImpl, `osionos_bridge_identities?email_hash=eq.${hash}&is_admin=is.false`, {
				method: 'PATCH', body: { is_admin: true }, prefer: 'return=minimal',
			});
		}
		const rows = await baasRest(config, fetchImpl, `osionos_bridge_identities?email_hash=eq.${hash}&select=is_admin&limit=1`);
		const row = Array.isArray(rows) ? rows[0] : null;
		return row?.is_admin === true || isAdminEmail;
	} catch {
		return isAdminEmail;
	}
}

/** Idempotently provision admin-workspace membership so its template pages ride
 *  the session token (workspace_ids). Best-effort; the admin gate is the claim. */
async function ensureAdminWorkspaceMembership(userId, config, fetchImpl) {
	if (!config.serviceKey || !config.baasUrl) return;
	try {
		await baasRest(config, fetchImpl, 'osionos_workspace_members', {
			method: 'POST',
			body: { workspace_id: ADMIN_WORKSPACE_ID, user_id: userId, role: 'admin', permissions: ['read', 'update', 'admin'] },
			prefer: 'resolution=merge-duplicates,return=minimal',
		});
	} catch {
		/* best-effort */
	}
}

export async function createBridgeHandoff({ payload, config, handoffStore, now = Date.now(), fetchImpl = fetch }) {
	if (!config.appSessionSecret) throw Object.assign(new Error('osionos app session secret is not configured.'), { status: 503 });
	let persisted = null;
	try {
		persisted = await persistBridgeIdentity(payload, config, fetchImpl);
	} catch (error) {
		if (config.requireBaas) throw error;
		console.warn(`[osionos-bridge] BaaS persistence skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
	}
	const isAdmin = await resolveAdminFlag(payload, config, fetchImpl).catch(() => false);
	if (isAdmin) await ensureAdminWorkspaceMembership(payload.subject, config, fetchImpl);
	const privateWorkspaceId = persisted?.workspaceId ?? uuidFromHash(`osionos-workspace:${payload.provider}:${payload.subject}`);
	const memberWorkspaces = await memberWorkspaceEntries(payload.subject, [privateWorkspaceId], config, fetchImpl);
	const bridgeSession = createUserSession(payload, config, persisted, now, memberWorkspaces, isAdmin);
	const token = randomToken();
	const expiresAt = now + config.handoffTtlMs;
	handoffStore.set(token, { ...bridgeSession, expiresAt });
	pruneExpiringMap(handoffStore, now);
	const redirectUrl = new URL(config.callbackPath, `${config.appUrl}/`);
	redirectUrl.hash = `bridge_token=${encodeURIComponent(token)}`;
	return {
		ok: true,
		redirectUrl: redirectUrl.toString(),
		expiresIn: Math.floor(config.handoffTtlMs / 1000),
		workspaceId: bridgeSession.session.privateWorkspaces[0]?._id,
		message: 'osionos bridge handoff is ready.',
	};
}

export function consumeHandoffToken(token, handoffStore, now = Date.now()) {
	const record = handoffStore.get(token);
	if (!record) throw Object.assign(new Error('Bridge handoff token is invalid.'), { status: 404 });
	if (record.expiresAt <= now) {
		handoffStore.delete(token);
		throw Object.assign(new Error('Bridge handoff token has expired.'), { status: 410 });
	}
	handoffStore.delete(token);
	return {
		ok: true,
		persona: record.persona,
		session: record.session,
		expiresAt: record.expiresAt,
		message: 'osionos session imported.',
	};
}

function safeUnsplashQuery(value) {
	return safeText(value, 80) || 'people workspace';
}

function safeUnsplashOrientation(value) {
	const orientation = safeText(value, 16);
	return ['landscape', 'portrait', 'squarish'].includes(orientation) ? orientation : 'landscape';
}

function safeUnsplashPerPage(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return DEFAULT_UNSPLASH_PER_PAGE;
	return Math.min(Math.max(Math.trunc(parsed), 1), MAX_UNSPLASH_PER_PAGE);
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = TRANSLATION_FETCH_TIMEOUT_MS) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetchImpl(url, { ...options, signal: controller.signal });
	} finally {
		clearTimeout(timeout);
	}
}

export async function searchUnsplashPhotos({ query, perPage, orientation } = {}, config = configFromEnv(), fetchImpl = fetch) {
	if (!config.unsplashAccessKey) {
		throw Object.assign(new Error('Unsplash access key is not configured on the osionos bridge.'), { status: 503 });
	}

	const url = new URL('https://api.unsplash.com/search/photos');
	url.searchParams.set('query', safeUnsplashQuery(query));
	url.searchParams.set('per_page', String(safeUnsplashPerPage(perPage)));
	url.searchParams.set('orientation', safeUnsplashOrientation(orientation));
	url.searchParams.set('content_filter', 'high');

	const response = await fetchImpl(url.toString(), {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			Authorization: `Client-ID ${config.unsplashAccessKey}`,
		},
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw Object.assign(new Error(`Unsplash search failed with ${response.status}: ${body.slice(0, 160)}`), { status: 502 });
	}

	const payload = await response.json().catch(() => ({}));
	return {
		ok: true,
		results: Array.isArray(payload.results) ? payload.results : [],
		total: Number.isFinite(payload.total) ? payload.total : undefined,
	};
}

// Geocoding cache (per process): a place NAME → resolved coordinates. Definitive
// results (a hit or a confirmed no-match) are cached; transient failures are not,
// so they retry. Keyed by the lowercased query; cleared wholesale past a cap.
const geocodeCache = new Map();

/**
 * Geocode any place in the world (city / country / region / address) to
 * coordinates via OpenStreetMap Nominatim — so the Map view can plot a name the
 * offline centroid tables don't carry. Returns `{lat, lng, label}` or `{}`.
 */
export async function geocodePlaceName(query, fetchImpl = fetch) {
	const q = safeText(query, 200).trim();
	if (!q) return {};
	const key = q.toLowerCase();
	if (geocodeCache.has(key)) return geocodeCache.get(key);
	const url = new URL('https://nominatim.openstreetmap.org/search');
	url.searchParams.set('format', 'jsonv2');
	url.searchParams.set('limit', '1');
	url.searchParams.set('q', q);
	let result = {};
	try {
		const response = await fetchWithTimeout(fetchImpl, url.toString(), {
			method: 'GET',
			headers: { Accept: 'application/json', 'User-Agent': 'osionos-geocoder/1.0 (track-binocle self-host)' },
		}, 8000);
		if (response.ok) {
			const data = await response.json().catch(() => null);
			const hit = Array.isArray(data) && data[0] ? data[0] : null;
			const lat = hit ? Number(hit.lat) : NaN;
			const lng = hit ? Number(hit.lon) : NaN;
			if (Number.isFinite(lat) && Number.isFinite(lng)) {
				result = { lat, lng, label: typeof hit.display_name === 'string' ? hit.display_name : q };
			}
		}
	} catch {
		return {}; // network/timeout — uncached so the next request retries
	}
	if (geocodeCache.size > 5000) geocodeCache.clear();
	geocodeCache.set(key, result);
	return result;
}

function safeTranslationLocale(value) {
	const locale = (safeText(value, 32) || 'fr').toLowerCase();
	if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/.test(locale)) {
		throw Object.assign(new Error('targetLocale must be a locale code.'), { status: 422 });
	}
	return locale;
}

function parseGoogleTranslateResponse(payload) {
	if (!Array.isArray(payload) || !Array.isArray(payload[0])) return null;
	const translated = payload[0]
		.map((part) => Array.isArray(part) && typeof part[0] === 'string' ? part[0] : '')
		.join('')
		.trim();
	return translated || null;
}

function parseTranslationResponse(payload) {
	if (!payload || typeof payload !== 'object') return null;
	const translated = payload.translatedText ?? payload.translation ?? payload.text;
	return typeof translated === 'string' && translated.trim() ? translated : null;
}

async function translateWithConfiguredEndpoint(text, targetLocale, config, fetchImpl) {
	if (!config.translationApiUrl) return null;
	let url;
	try {
		url = new URL(config.translationApiUrl);
	} catch {
		return null;
	}
	const response = await fetchWithTimeout(fetchImpl, url.toString(), {
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		body: JSON.stringify({ text, targetLocale, sourceLocale: 'auto' }),
	});
	if (!response.ok) return null;
	return parseTranslationResponse(await response.json().catch(() => null));
}

async function translateWithGoogle(text, targetLocale, fetchImpl) {
	const url = new URL('https://translate.googleapis.com/translate_a/single');
	url.searchParams.set('client', 'gtx');
	url.searchParams.set('sl', 'auto');
	url.searchParams.set('tl', targetLocale);
	url.searchParams.set('dt', 't');
	url.searchParams.set('q', text);
	const response = await fetchWithTimeout(fetchImpl, url.toString());
	if (!response.ok) return null;
	return parseGoogleTranslateResponse(await response.json().catch(() => null));
}

async function translateWithMyMemory(text, targetLocale, fetchImpl) {
	const url = new URL('https://api.mymemory.translated.net/get');
	url.searchParams.set('q', text);
	url.searchParams.set('langpair', `auto|${targetLocale}`);
	const response = await fetchWithTimeout(fetchImpl, url.toString());
	if (!response.ok) return null;
	const payload = await response.json().catch(() => null);
	const translated = payload?.responseData?.translatedText;
	return typeof translated === 'string' && translated.trim() ? translated : null;
}

async function translateText(text, targetLocale, config, fetchImpl, cache) {
	if (typeof text !== 'string' || !text.trim()) return text;
	const cacheKey = `${targetLocale}\u0000${text}`;
	const cached = cache.get(cacheKey);
	if (cached) return cached;
	const promise = (async () => {
		for (const translator of [
			() => translateWithConfiguredEndpoint(text, targetLocale, config, fetchImpl),
			() => translateWithGoogle(text, targetLocale, fetchImpl),
			() => translateWithMyMemory(text, targetLocale, fetchImpl),
		]) {
			try {
				const translated = await translator();
				if (translated && !translated.startsWith(`[${targetLocale}] `)) return translated;
			} catch {
				// Try the next provider.
			}
		}
		return text;
	})();
	cache.set(cacheKey, promise);
	return promise;
}

async function translateBlock(block, targetLocale, config, fetchImpl, cache) {
	if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
	const next = { ...block };
	if (TRANSLATABLE_BLOCK_TYPES.has(String(block.type)) && typeof block.content === 'string') {
		next.content = await translateText(block.content, targetLocale, config, fetchImpl, cache);
	}
	if (Array.isArray(block.tableData)) {
		next.tableData = await Promise.all(block.tableData.map((row) => Array.isArray(row)
			? Promise.all(row.map((cell) => translateText(cell, targetLocale, config, fetchImpl, cache)))
			: row));
	}
	if (Array.isArray(block.children)) {
		next.children = await Promise.all(block.children.map((child) => translateBlock(child, targetLocale, config, fetchImpl, cache)));
	}
	return next;
}

async function readJson(request, maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES) {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
		if (body.length > maxBytes) throw Object.assign(new Error('Request body too large.'), { status: 413 });
	}
	return body ? JSON.parse(body) : {};
}

function json(response, status, body, config) {
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end(JSON.stringify(body));
}

function requestOriginConfig(config, request) {
	const origin = String(request.headers.origin ?? '');
	if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin)
		|| /^tauri:\/\/localhost$/i.test(origin)
		|| /^https?:\/\/tauri\.localhost$/i.test(origin)
		|| /^app:\/\/osionos$/i.test(origin)) {
		return { ...config, allowedOrigin: origin };
	}
	return config;
}

function sse(response, event, data) {
	response.write(`event: ${event}\n`);
	response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sanitizeClaudeRequest(payload) {
	const prompt = safeText(payload.prompt, 8000);
	if (!prompt) throw Object.assign(new Error('Prompt is required.'), { status: 422 });
	const agent = safeText(payload.agent, 80);
	const model = safeText(payload.model, 40) || 'default';
	const effort = safeText(payload.effort, 20) || 'medium';
	const maxBudgetUsd = Math.min(Math.max(Number(payload.maxBudgetUsd ?? 0.5), 0.01), 2);
	const allowedToolKeys = Array.isArray(payload.allowedTools)
		? payload.allowedTools.map((tool) => safeText(tool, 40)).filter((tool) => tool in CLAUDE_TOOL_MAP)
		: ['app', 'status', 'workspace', 'list', 'search', 'read', 'create', 'update'];
	const context = payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context)
		? payload.context
		: {};
	return {
		prompt,
		agent: CLAUDE_AGENT_VALUES.has(agent) ? agent : '',
		model: CLAUDE_MODEL_VALUES.has(model) ? model : 'default',
		effort: CLAUDE_EFFORT_VALUES.has(effort) ? effort : 'medium',
		maxBudgetUsd,
		allowedTools: [...new Set(allowedToolKeys.flatMap((tool) => CLAUDE_TOOL_MAP[tool]))],
		context,
	};
}

function buildClaudePrompt(request) {
	return [
		'You are Claude, speaking inside an osionos Agent page.',
		'Answer normal conversational prompts directly. Do not create or update pages unless the user asks you to work with osionos content.',
		'When the user asks to create, read, search, update, or archive osionos content, use the osionos MCP tools that are available to you.',
		'When the user asks for documentation about osionos, how the app works, or a note that demonstrates slash/block elements, call osionos_describe_app first and then create the page with explicit rich block content.',
		'Keep responses concise and suitable for a chat transcript. If you use tools, summarize what changed.',
		'Current app context:',
		JSON.stringify(request.context, null, 2).slice(0, 6000),
		'User message:',
		request.prompt,
	].join('\n\n');
}

function buildClaudeArgs(request) {
	const args = [
		'-p', buildClaudePrompt(request),
		'--output-format', 'stream-json',
		'--verbose',
		'--permission-mode', 'bypassPermissions',
		'--max-budget-usd', request.maxBudgetUsd.toFixed(2),
	];
	if (request.agent) args.push('--agent', request.agent);
	if (request.model !== 'default') args.push('--model', request.model);
	if (request.effort) args.push('--effort', request.effort);
	if (request.allowedTools.length > 0) args.push('--allowedTools', request.allowedTools.join(','));
	return args;
}

function summarizeToolResult(event) {
	const content = event?.message?.content?.[0]?.content;
	if (!Array.isArray(content)) return null;
	const toolUseId = event.message.content[0].tool_use_id;
	const text = content.map((item) => item?.text ?? '').join('\n').trim();
	return { toolUseId, text: text.slice(0, MAX_CLAUDE_TOOL_RESULT_TEXT) };
}

function emitAssistantContent(response, content) {
	if (!Array.isArray(content)) return;
	for (const item of content) {
		if (item.type === 'text' && item.text) sse(response, 'delta', { text: item.text });
		if (item.type === 'tool_use') sse(response, 'tool', { id: item.id, name: item.name, input: item.input ?? {} });
	}
}

function emitClaudeEvent(response, event) {
	if (event.type === 'assistant') {
		emitAssistantContent(response, event?.message?.content);
		return '';
	}
	if (event.type === 'user') {
		const result = summarizeToolResult(event);
		if (result) sse(response, 'tool_result', result);
		return '';
	}
	if (event.type !== 'result') return '';
	const finalResult = String(event.result ?? '');
	sse(response, 'result', { text: finalResult, sessionId: event.session_id ?? null });
	return finalResult;
}

async function handleClaudeAgentStream(request, response, config) {
	const payload = sanitizeClaudeRequest(await readJson(request));
	response.writeHead(200, {
		'content-type': 'text/event-stream; charset=utf-8',
		'cache-control': 'no-store',
		connection: 'keep-alive',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	sse(response, 'meta', {
		agent: payload.agent || 'default',
		model: payload.model,
		effort: payload.effort,
		allowedTools: payload.allowedTools,
	});

	const child = spawn(process.env.CLAUDE_BIN ?? 'claude', buildClaudeArgs(payload), {
		cwd: resolve(APP_ROOT, '../../..'),
		env: process.env,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let buffer = '';
	let stderr = '';
	let finalResult = '';

	function handleLine(line) {
		if (!line.trim()) return;
		let event;
		try {
			event = JSON.parse(line);
		} catch {
			sse(response, 'delta', { text: line });
			return;
		}
		finalResult = emitClaudeEvent(response, event) || finalResult;
	}

	child.stdout.on('data', (chunk) => {
		buffer += chunk.toString('utf8');
		let newline = buffer.indexOf('\n');
		while (newline >= 0) {
			handleLine(buffer.slice(0, newline));
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf('\n');
		}
	});
	child.stderr.on('data', (chunk) => {
		stderr += chunk.toString('utf8');
	});
	request.on('close', () => {
		if (!response.writableEnded) child.kill('SIGTERM');
	});
	child.on('error', (error) => {
		sse(response, 'error', { message: error.message });
		response.end();
	});
	child.on('close', (code) => {
		if (buffer.trim()) handleLine(buffer);
		if (code !== 0) sse(response, 'error', { message: stderr.trim() || `Claude exited with code ${code}` });
		sse(response, 'done', { code, result: finalResult });
		response.end();
	});
}

function errorJson(response, error, config) {
	json(response, error.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Bridge request failed.' }, config);
}

function writeOptionsResponse(response, config) {
	response.writeHead(204, {
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
		'access-control-allow-headers': 'content-type, authorization, x-prismatica-bridge-timestamp, x-prismatica-bridge-signature',
		vary: 'Origin',
	});
	response.end();
}

function pageIdFromPath(pathname) {
	const match = /^\/api\/pages\/([^/]+)$/.exec(pathname);
	if (!match) return '';
	return requireUuid(decodeURIComponent(match[1]), 'pageId');
}

function pageSubresourceIdFromPath(pathname, subresource) {
	const parts = pathname.split('/');
	if (parts.length !== 5 || parts[1] !== 'api' || parts[2] !== 'pages' || parts[4] !== subresource) return '';
	return requirePageReference(decodeURIComponent(parts[3]));
}

async function handlePageList(url, request, response, config, fetchImpl) {
	const workspaceId = requireUuid(url.searchParams.get('workspaceId'), 'workspaceId');
	await requireWorkspaceAccess(request, workspaceId, 'read', config, fetchImpl);
	const filters = url.pathname === '/api/pages/all' ? {} : {
		databaseId: url.searchParams.has('databaseId')
			? (url.searchParams.get('databaseId') || null)
			: undefined,
		parentPageId: url.searchParams.has('parentPageId')
			? (url.searchParams.get('parentPageId') || null)
			: undefined,
		surface: PAGE_SURFACE_VALUES.has(url.searchParams.get('surface')) ? url.searchParams.get('surface') : undefined,
	};
	json(response, 200, pageRowsToEntries(await listPageRows(workspaceId, config, fetchImpl, filters)), config);
	return true;
}

const PAGE_SEARCH_MAX = 25;

/** Rank a page row against a lowercased query: title-prefix > title-substring > content hit. */
function rankPageRow(row, query) {
	const title = String(row.title || 'Untitled').toLowerCase();
	const titleIndex = title.indexOf(query);
	if (titleIndex === 0) return 3;
	if (titleIndex > 0) return 2;
	try {
		if (JSON.stringify(row.content ?? '').toLowerCase().includes(query)) return 1;
	} catch { /* unserialisable content — fall back to title-only */ }
	return -1;
}

/**
 * GET /api/pages/search?workspaceId=&q=&limit= — server-side search across ALL pages
 * in the workspace (not just the client-loaded subset), so deeply nested notes are
 * found by title or content. Owner/ACL-scoped via requireWorkspaceAccess. This is the
 * stable contract the grobase vector backend (cosine /search) will later serve unchanged.
 */
async function handlePageSearch(url, request, response, config, fetchImpl) {
	const workspaceId = requireUuid(url.searchParams.get('workspaceId'), 'workspaceId');
	await requireWorkspaceAccess(request, workspaceId, 'read', config, fetchImpl);
	const query = (url.searchParams.get('q') || '').trim().toLowerCase();
	const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '12', 10) || 12, 1), PAGE_SEARCH_MAX);
	if (!query) { json(response, 200, [], config); return true; }
	const rows = await listPageRows(workspaceId, config, fetchImpl, {});
	const ranked = rows
		.filter((row) => !row.archived_at)
		.map((row) => ({ row, rank: rankPageRow(row, query) }))
		.filter((entry) => entry.rank >= 0)
		.sort((a, b) => b.rank - a.rank || String(b.row.updated_at || '').localeCompare(String(a.row.updated_at || '')))
		.slice(0, limit)
		.map((entry) => entry.row);
	json(response, 200, pageRowsToEntries(ranked), config);
	return true;
}

async function handlePageRead(url, request, response, config, fetchImpl) {
	const pageId = pageIdFromPath(url.pathname);
	if (!pageId) return false;
	const row = await fetchPageRow(pageId, config, fetchImpl);
	if (!row) throw Object.assign(new Error('Page not found.'), { status: 404 });
	await ownerOrWorkspaceAccess(request, row, 'read', config, fetchImpl);
	json(response, 200, pageRowToEntry(row), config);
	return true;
}

async function handlePageConfigRead(url, request, response, config, fetchImpl) {
	const pageId = pageSubresourceIdFromPath(url.pathname, 'config');
	if (!pageId) return false;
	const { authContext } = await requirePageScopeAccess(request, pageId, {}, 'read', config, fetchImpl);
	const configRow = await fetchPageConfigRow(pageId, authContext.userId, config, fetchImpl);
	json(response, 200, {
		ok: true,
		pageId,
		config: configRow?.config && typeof configRow.config === 'object' ? configRow.config : {},
		updatedAt: configRow?.updated_at ?? null,
	}, config);
	return true;
}

// ── Marketplace (shared global app catalogue) ───────────────────────────────
// Cross-workspace reads of the system-owned marketplace use the bridge's service-role
// key (which bypasses RLS), so any authenticated user can browse published apps without
// being a member of the marketplace workspace.

/** Tally how many users have each app installed — the real "downloads" number (no mocks). */
async function marketplaceInstallCounts(config, fetchImpl) {
	const rows = await baasRest(config, fetchImpl, `osionos_page_configurations?${postgrestQuery({ page_id: `eq.${MARKETPLACE_DATABASE_ID}`, select: 'config' })}`);
	const counts = {};
	for (const r of Array.isArray(rows) ? rows : []) {
		const inst = r && r.config && r.config.installed;
		if (inst && typeof inst === 'object') for (const id of Object.keys(inst)) counts[id] = (counts[id] || 0) + 1;
	}
	return counts;
}

/** Overwrite each entry's "downloads" property with its real install count. */
function injectInstallCounts(entries, counts) {
	for (const e of entries) {
		const props = Array.isArray(e.properties) ? e.properties : (e.properties = []);
		const idProp = props.find((p) => p.key === 'identifier');
		const real = counts[idProp ? idProp.value : ''] || 0;
		const dl = props.find((p) => p.key === 'downloads');
		if (dl) dl.value = real;
		else props.push({ key: 'downloads', label: 'Installs', type: 'number', value: real });
	}
	return entries;
}

/** List published marketplace apps (records under the marketplace database, visibility public). */
async function handleMarketplaceList(request, response, config, fetchImpl) {
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	const base = { database_id: `eq.${MARKETPLACE_DATABASE_ID}`, archived_at: 'is.null' };
	const published = await baasRest(config, fetchImpl, `osionos_pages?${postgrestQuery({ ...base, visibility: 'eq.public' })}`);
	const mine = await baasRest(config, fetchImpl, `osionos_pages?${postgrestQuery({ ...base, owner_id: `eq.${authContext.userId}` })}`);
	const byId = new Map();
	for (const r of [...(Array.isArray(published) ? published : []), ...(Array.isArray(mine) ? mine : [])]) {
		if (r && r.id) byId.set(r.id, r);
	}
	const rows = [...byId.values()].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
	const counts = await marketplaceInstallCounts(config, fetchImpl);
	json(response, 200, injectInstallCounts(pageRowsToEntries(rows), counts), config);
	return true;
}

/** One marketplace app record + its child sub-pages (Details/Features/Changelog/…), with content. */
async function handleMarketplaceApp(appId, request, response, config, fetchImpl) {
	verifyAppSessionToken(bearerToken(request), config);
	const id = requireUuid(appId, 'appId');
	const appRow = await fetchPageRow(id, config, fetchImpl);
	if (!appRow || appRow.workspace_id !== MARKETPLACE_WORKSPACE_ID) {
		throw Object.assign(new Error('App not found.'), { status: 404 });
	}
	const childRows = await baasRest(config, fetchImpl, `osionos_pages?${postgrestQuery({
		parent_page_id: `eq.${id}`,
		archived_at: 'is.null',
		order: 'created_at.asc',
	})}`);
	const counts = await marketplaceInstallCounts(config, fetchImpl);
	json(response, 200, {
		app: injectInstallCounts([pageRowToEntry(appRow)], counts)[0],
		children: pageRowsToEntries(Array.isArray(childRows) ? childRows : []),
	}, config);
	return true;
}

/** Per-user installed-app set (stored in osionos_page_configurations keyed to the marketplace db). */
async function handleMarketplaceInstalledRead(request, response, config, fetchImpl) {
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	const row = await fetchPageConfigRow(MARKETPLACE_DATABASE_ID, authContext.userId, config, fetchImpl);
	const cfg = row?.config && typeof row.config === 'object' ? row.config : {};
	json(response, 200, { installed: cfg.installed && typeof cfg.installed === 'object' ? cfg.installed : {} }, config);
	return true;
}

/** Replace the caller's installed-app set. */
async function handleMarketplaceInstalledWrite(request, response, config, fetchImpl) {
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	const payload = await readJson(request, PAGE_JSON_BODY_LIMIT_BYTES);
	const installed = safeJsonObject(payload.installed, 'installed');
	await baasRest(config, fetchImpl, 'osionos_page_configurations?on_conflict=user_id,page_id', {
		method: 'POST',
		body: {
			page_id: MARKETPLACE_DATABASE_ID,
			workspace_id: MARKETPLACE_WORKSPACE_ID,
			user_id: authContext.userId,
			config: { installed },
			updated_at: new Date().toISOString(),
		},
		prefer: 'resolution=merge-duplicates,return=minimal',
	});
	json(response, 200, { ok: true, installed }, config);
	return true;
}

/** Publish an app record the caller owns into the marketplace (public + published-locked). */
async function handleMarketplacePublish(request, response, config, fetchImpl) {
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	const payload = await readJson(request, PAGE_JSON_BODY_LIMIT_BYTES);
	const pageId = requireUuid(payload.pageId, 'pageId');
	const row = await fetchPageRow(pageId, config, fetchImpl);
	if (!row) throw Object.assign(new Error('Page not found.'), { status: 404 });
	if (row.owner_id && row.owner_id !== authContext.userId) {
		throw Object.assign(new Error('Only the owner can publish this app.'), { status: 403 });
	}
	const props = (Array.isArray(row.properties) ? row.properties : []).filter((p) => p && p.key !== 'published' && p.key !== 'publishedAt');
	props.push({ key: 'published', label: 'Published', type: 'checkbox', value: true });
	props.push({ key: 'publishedAt', label: 'Published at', type: 'date', value: new Date().toISOString() });
	const updated = await baasRest(config, fetchImpl, `osionos_pages?id=eq.${pageId}`, {
		method: 'PATCH',
		body: { properties: props, visibility: 'public', updated_at: new Date().toISOString() },
		prefer: 'return=representation',
	});
	json(response, 200, pageRowToEntry(Array.isArray(updated) ? updated[0] : updated), config);
	return true;
}

/** Default property set for a freshly created draft app. */
function defaultAppProperties(identifier) {
	return [
		{ key: 'company', label: 'Company', type: 'text', value: '' },
		{ key: 'verified', label: 'Verified', type: 'checkbox', value: false },
		{ key: 'website', label: 'Website', type: 'url', value: '' },
		{ key: 'shortDescription', label: 'Description', type: 'text', value: '' },
		{ key: 'version', label: 'Version', type: 'text', value: '0.1.0' },
		{ key: 'identifier', label: 'Identifier', type: 'text', value: identifier },
		{ key: 'categories', label: 'Categories', type: 'multi_select', value: [] },
		{ key: 'resources', label: 'Resources', type: 'multi_select', value: [] },
		{ key: 'published', label: 'Published', type: 'checkbox', value: false },
		{ key: 'launchKind', label: 'Launch', type: 'text', value: 'embed' },
		{ key: 'launchUrl', label: 'Launch URL', type: 'url', value: '' },
	];
}

const MARKETPLACE_SUBPAGES = [
	['Details', 'icon:file-text'], ['Features', 'icon:sparkles'], ['Changelog', 'icon:history'],
	['Installation', 'icon:download'], ['Categories', 'icon:tag'], ['Resources', 'icon:link'],
];

/** Create a new DRAFT app (owned by the caller, not yet public) + its standard child sub-pages. */
async function handleMarketplaceCreate(request, response, config, fetchImpl) {
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	const payload = await readJson(request, PAGE_JSON_BODY_LIMIT_BYTES);
	const title = safeText(payload.title, 200) || 'New app';
	const appId = randomUUID();
	const identifier = `app.${appId.slice(0, 8)}`;
	await baasRest(config, fetchImpl, 'osionos_pages', {
		method: 'POST',
		body: {
			id: appId, workspace_id: MARKETPLACE_WORKSPACE_ID, parent_page_id: MARKETPLACE_DATABASE_ID,
			owner_id: authContext.userId, database_id: MARKETPLACE_DATABASE_ID, title, icon: 'icon:box',
			surface: 'app', visibility: 'private', collaborators: [], properties: defaultAppProperties(identifier), content: [],
		},
		prefer: 'return=minimal',
	});
	for (const [t, ic] of MARKETPLACE_SUBPAGES) {
		await baasRest(config, fetchImpl, 'osionos_pages', {
			method: 'POST',
			body: {
				id: randomUUID(), workspace_id: MARKETPLACE_WORKSPACE_ID, parent_page_id: appId, owner_id: authContext.userId,
				title: t, icon: ic, surface: 'page', visibility: 'private', collaborators: [], properties: [], content: [],
			},
			prefer: 'return=minimal',
		});
	}
	json(response, 201, pageRowToEntry(await fetchPageRow(appId, config, fetchImpl)), config);
	return true;
}

/** Owner-only edit of a draft app's title / icon / properties. */
async function handleMarketplaceUpdate(appId, request, response, config, fetchImpl) {
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	const id = requireUuid(appId, 'appId');
	const row = await fetchPageRow(id, config, fetchImpl);
	if (!row || row.workspace_id !== MARKETPLACE_WORKSPACE_ID) throw Object.assign(new Error('App not found.'), { status: 404 });
	if (row.owner_id !== authContext.userId) throw Object.assign(new Error('Only the owner can edit this app.'), { status: 403 });
	const payload = await readJson(request, PAGE_JSON_BODY_LIMIT_BYTES);
	const patch = { updated_at: new Date().toISOString() };
	if (hasOwn(payload, 'title')) patch.title = safeText(payload.title, 200) || 'New app';
	if (hasOwn(payload, 'icon')) patch.icon = safeText(payload.icon, 80) || null;
	if (hasOwn(payload, 'properties')) patch.properties = safeJsonArray(payload.properties);
	const updated = await baasRest(config, fetchImpl, `osionos_pages?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
	json(response, 200, pageRowToEntry(Array.isArray(updated) ? updated[0] : updated), config);
	return true;
}

async function handleMarketplacePatch(url, request, response, config, fetchImpl) {
	const m = /^\/api\/marketplace\/apps\/([^/]+)$/.exec(url.pathname);
	if (!m) return false;
	return handleMarketplaceUpdate(decodeURIComponent(m[1]), request, response, config, fetchImpl);
}

/** Read the shared (per-database) header template a designer saved (stored under the system user). */
async function handleMarketplaceTemplateRead(url, request, response, config, fetchImpl) {
	verifyAppSessionToken(bearerToken(request), config);
	const databaseId = requireUuid(url.searchParams.get('databaseId'), 'databaseId');
	const row = await fetchPageConfigRow(databaseId, MARKETPLACE_SYSTEM_USER, config, fetchImpl);
	const cfg = row?.config && typeof row.config === 'object' ? row.config : {};
	json(response, 200, { template: cfg.headerTemplate ?? null }, config);
	return true;
}

/** Save a shared (per-database) header template — any authenticated user, for v1 (gate to owner/admin later). */
async function handleMarketplaceTemplateWrite(request, response, config, fetchImpl) {
	verifyAppSessionToken(bearerToken(request), config);
	const payload = await readJson(request, PAGE_JSON_BODY_LIMIT_BYTES);
	const databaseId = requireUuid(payload.databaseId, 'databaseId');
	const template = safeJsonObject(payload.template, 'template');
	const dbRow = await fetchPageRow(databaseId, config, fetchImpl);
	await baasRest(config, fetchImpl, 'osionos_page_configurations?on_conflict=user_id,page_id', {
		method: 'POST',
		body: {
			page_id: databaseId,
			workspace_id: dbRow?.workspace_id || MARKETPLACE_WORKSPACE_ID,
			user_id: MARKETPLACE_SYSTEM_USER,
			config: { headerTemplate: template },
			updated_at: new Date().toISOString(),
		},
		prefer: 'resolution=merge-duplicates,return=minimal',
	});
	json(response, 200, { ok: true }, config);
	return true;
}

async function handleMarketplaceGet(url, request, response, config, fetchImpl) {
	if (url.pathname === '/api/marketplace/apps') return handleMarketplaceList(request, response, config, fetchImpl);
	if (url.pathname === '/api/marketplace/installed') return handleMarketplaceInstalledRead(request, response, config, fetchImpl);
	if (url.pathname === '/api/marketplace/header-template') return handleMarketplaceTemplateRead(url, request, response, config, fetchImpl);
	const m = /^\/api\/marketplace\/apps\/([^/]+)$/.exec(url.pathname);
	if (m) return handleMarketplaceApp(decodeURIComponent(m[1]), request, response, config, fetchImpl);
	return false;
}

async function handleMarketplacePost(url, request, response, config, fetchImpl) {
	if (url.pathname === '/api/marketplace/apps') return handleMarketplaceCreate(request, response, config, fetchImpl);
	if (url.pathname === '/api/marketplace/installed') return handleMarketplaceInstalledWrite(request, response, config, fetchImpl);
	if (url.pathname === '/api/marketplace/publish') return handleMarketplacePublish(request, response, config, fetchImpl);
	if (url.pathname === '/api/marketplace/header-template') return handleMarketplaceTemplateWrite(request, response, config, fetchImpl);
	return false;
}

/**
 * Owner-scoped page graph from the CANONICAL osionos_pages (replaces the duplicate
 * Mongo og_notes as the graph's note source). Returns the viewer's own pages as a
 * BaaS graph (note nodes + parent + tag edges). Owner-scoping is authoritative here:
 * we only include rows the caller owns, so the graph never leaks another user's pages.
 */
/** osionos_workspace_databases rows for the given workspace ids ([] on failure). */
async function listWorkspaceDatabases(workspaceIds, config, fetchImpl) {
	if (workspaceIds.length === 0) return [];
	try {
		const query = postgrestQuery({
			workspace_id: `in.(${workspaceIds.join(',')})`,
			select: 'workspace_id,db_id,engine,tables,edges_table,label',
		});
		const rows = await baasRest(config, fetchImpl, `osionos_workspace_databases?${query}`);
		return Array.isArray(rows) ? rows : [];
	} catch {
		return [];
	}
}

/** Owner-scoped page graph across `workspaceIds` (the note half of the data graph). */
async function ownerScopedPageGraph(workspaceIds, userId, config, fetchImpl) {
	const rows = [];
	for (const workspaceId of workspaceIds) {
		const wsRows = await listPageRows(workspaceId, config, fetchImpl, {});
		for (const row of wsRows) {
			if (row.owner_id == null || row.owner_id === userId) rows.push(row);
		}
	}
	return pagesToGraph(rows);
}

/** Record graph from the workspaces' authorized mounts (empty when none / on error). */
async function workspaceRecordGraph(workspaceIds, config, fetchImpl) {
	const wsdb = await listWorkspaceDatabases(workspaceIds, config, fetchImpl);
	const request = overviewRequest(wsdb);
	if (!request) return { nodes: [], edges: [] };
	try {
		return (await baasQueryPost(config, fetchImpl, '/graph/overview', request, GRAPH_FETCH_TIMEOUT_MS)) ?? { nodes: [], edges: [] };
	} catch {
		return { nodes: [], edges: [] };
	}
}

/**
 * GET /api/graph/data — the whole multi-engine ecosystem the viewer can access:
 * note nodes ⊕ records from every database their workspaces are linked to (via
 * osionos_workspace_databases). scope=workspace (default — the requested or token
 * workspace) | account (every workspace the session is a member of). A workspace
 * the session can't access contributes nothing.
 */
async function handleGraphData(url, request, response, config, fetchImpl) {
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	const scope = url.searchParams.get('scope') === 'account' ? 'account' : 'workspace';
	const requested = url.searchParams.get('workspaceId');
	const memberIds = await memberWorkspaceIds(authContext.userId, config, fetchImpl);
	const accessible = [...new Set([...authContext.workspaceIds, ...memberIds])];
	const workspaceIds = scope === 'account'
		? accessible
		: requested
			? (accessible.includes(requested) ? [requested] : [])
			: authContext.workspaceIds;
	const noteGraph = await ownerScopedPageGraph(workspaceIds, authContext.userId, config, fetchImpl);
	const recordGraph = await workspaceRecordGraph(workspaceIds, config, fetchImpl);
	json(response, 200, mergeGraphs(noteGraph, recordGraph), config);
	return true;
}

// ── Record → note (workstream D) ────────────────────────────────────────────
// A record in any engine the viewer's workspaces are linked to (via
// osionos_workspace_databases) can be read or opened as a deterministic note.
// Access is the SAME union handleGraphData uses: token.workspaceIds ∪ member
// workspaces, then the dbId must appear in one of those workspaces' mounts.

/**
 * Resolve `{dbId}` to the wsdb mount the session may read, or 403. Returns the
 * matching osionos_workspace_databases row (engine + linking workspace_id).
 */
async function resolveAccessibleMount(request, dbId, config, fetchImpl) {
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	const memberIds = await memberWorkspaceIds(authContext.userId, config, fetchImpl);
	const accessible = [...new Set([...authContext.workspaceIds, ...memberIds])];
	const mounts = await listWorkspaceDatabases(accessible, config, fetchImpl);
	const mount = mounts.find((row) => row && row.db_id === dbId);
	if (!mount) throw Object.assign(new Error('Database is not linked to an accessible workspace.'), { status: 403 });
	return { authContext, mount };
}

/**
 * Set of db_ids the caller may see — every mount linked to a workspace the user
 * owns or is a member of (the user→workspace→database M2M relation). Verifies the
 * app session (401 on a missing/invalid token). Used to membership-scope the
 * Databases navigator listing the same way `resolveAccessibleMount` scopes reads.
 */
async function accessibleMountIds(request, config, fetchImpl) {
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	const memberIds = await memberWorkspaceIds(authContext.userId, config, fetchImpl);
	const accessible = [...new Set([...authContext.workspaceIds, ...memberIds])];
	const mounts = await listWorkspaceDatabases(accessible, config, fetchImpl);
	return new Set(mounts.map((row) => row && row.db_id).filter(Boolean));
}

/** Fetch one record via the query-router (engine-aware pk column). */
async function fetchRecordRow(dbId, table, pk, engine, config, fetchImpl) {
	const pkColumn = pkColumnForEngine(engine);
	// An all-digit pk binds to an integer key column (pg/mysql serial ids); a
	// non-numeric pk (e.g. mongo `evt-000001`) stays a string. Sending "1234" as a
	// string to an int column makes the data-plane 409 on the type mismatch.
	const pkValue = /^\d+$/.test(pk) ? Number(pk) : pk;
	const result = await baasQueryPost(config, fetchImpl, `/${dbId}/tables/${table}`, {
		op: 'get',
		filter: { [pkColumn]: pkValue },
	});
	if (Array.isArray(result)) return result[0] ?? null;
	if (result && typeof result === 'object' && Array.isArray(result.rows)) return result.rows[0] ?? null;
	if (result && typeof result === 'object' && result.row) return result.row;
	return result ?? null;
}

/** GET /api/records/:dbId/:table/:pk — read one record + its deterministic note id. */
async function handleRecordRead(match, request, response, config, fetchImpl) {
	const dbId = requireUuid(decodeURIComponent(match[1]), 'dbId');
	const table = safeText(decodeURIComponent(match[2]), 120);
	const pk = safeText(decodeURIComponent(match[3]), 220);
	if (!table || !pk) throw Object.assign(new Error('table and pk are required.'), { status: 422 });
	const { mount } = await resolveAccessibleMount(request, dbId, config, fetchImpl);
	const row = await fetchRecordRow(dbId, table, pk, mount.engine, config, fetchImpl);
	if (!row) throw Object.assign(new Error('Record not found.'), { status: 404 });
	json(response, 200, { dbId, table, pk, row, noteId: recordNoteId(dbId, table, pk) }, config);
	return true;
}

/**
 * Resolve-or-create the deterministic note that mirrors a record (idempotent).
 * The shared seam behind /open and the sub-item routes: enforces the mount ACL,
 * reads the row, upserts the record-note (recordNoteId), and returns the note id
 * + the mount/auth context the caller needs to keep going.
 */
async function ensureRecordNote(dbId, table, pk, request, config, fetchImpl) {
	const { authContext, mount } = await resolveAccessibleMount(request, dbId, config, fetchImpl);
	const row = await fetchRecordRow(dbId, table, pk, mount.engine, config, fetchImpl);
	if (!row) throw Object.assign(new Error('Record not found.'), { status: 404 });
	const body = recordNotePageBody({
		dbId, table, pk, row,
		engine: mount.engine,
		workspaceId: mount.workspace_id,
		userId: authContext.userId,
		now: new Date().toISOString(),
	});
	await baasRest(config, fetchImpl, 'osionos_pages?on_conflict=id', {
		method: 'POST',
		body,
		prefer: 'resolution=merge-duplicates,return=minimal',
	});
	return { noteId: body.id, mount, authContext };
}

/** POST /api/records/:dbId/:table/:pk/open — resolve-or-create the linked note (idempotent). */
async function handleRecordOpen(match, request, response, config, fetchImpl) {
	const dbId = requireUuid(decodeURIComponent(match[1]), 'dbId');
	const table = safeText(decodeURIComponent(match[2]), 120);
	const pk = safeText(decodeURIComponent(match[3]), 220);
	if (!table || !pk) throw Object.assign(new Error('table and pk are required.'), { status: 422 });
	const { noteId } = await ensureRecordNote(dbId, table, pk, request, config, fetchImpl);
	json(response, 200, pageRowToEntry(await fetchPageRow(noteId, config, fetchImpl)), config);
	return true;
}

/**
 * GET /api/records/:dbId/:table/:pk/subitems — the caller's hand-created
 * sub-item notes nested under the record-note. Owner-scoped (private by default;
 * the record-note model is owner-stamped). The parent note need not exist yet —
 * an empty list is the natural answer.
 * ponytail: owner-scoped (personal annotations) — drop owner_id for shared sub-items.
 */
async function handleRecordSubitemsList(match, request, response, config, fetchImpl) {
	const dbId = requireUuid(decodeURIComponent(match[1]), 'dbId');
	const table = safeText(decodeURIComponent(match[2]), 120);
	const pk = safeText(decodeURIComponent(match[3]), 220);
	if (!table || !pk) throw Object.assign(new Error('table and pk are required.'), { status: 422 });
	const { authContext } = await resolveAccessibleMount(request, dbId, config, fetchImpl);
	const parentNoteId = recordNoteId(dbId, table, pk);
	const childRows = await baasRest(config, fetchImpl, `osionos_pages?${postgrestQuery({
		parent_page_id: `eq.${parentNoteId}`,
		owner_id: `eq.${authContext.userId}`,
		archived_at: 'is.null',
		order: 'created_at.asc',
	})}`);
	json(response, 200, {
		dbId, table, pk, parentNoteId,
		children: pageRowsToEntries(Array.isArray(childRows) ? childRows : []),
	}, config);
	return true;
}

/**
 * POST /api/records/:dbId/:table/:pk/subitems — create a child note (ensures the
 * record-note first). The sub-item is the CALLER'S own editable note, so it lands
 * in a workspace the caller controls (body `workspaceId`, verified for create),
 * NOT the mount's workspace — which may be a read-only seed where the standard
 * page DELETE/PATCH ACL would later 403. It links cross-workspace to the shared
 * record-note via parent_page_id.
 */
async function handleRecordSubitemCreate(match, request, response, config, fetchImpl) {
	const dbId = requireUuid(decodeURIComponent(match[1]), 'dbId');
	const table = safeText(decodeURIComponent(match[2]), 120);
	const pk = safeText(decodeURIComponent(match[3]), 220);
	if (!table || !pk) throw Object.assign(new Error('table and pk are required.'), { status: 422 });
	const payload = await readJson(request, PAGE_JSON_BODY_LIMIT_BYTES).catch(() => ({}));
	const safe = payload && typeof payload === 'object' ? payload : {};
	const access = await requireWorkspaceAccess(request, safe.workspaceId, 'create', config, fetchImpl);
	const { noteId } = await ensureRecordNote(dbId, table, pk, request, config, fetchImpl);
	const body = recordSubitemNoteBody({
		id: randomUUID(),
		parentNoteId: noteId,
		workspaceId: access.workspaceId,
		userId: access.userId,
		title: safeText(safe.title, 200),
		icon: safeText(safe.icon, 80),
		properties: safeJsonArray(safe.properties),
		content: safeJsonArray(safe.content),
		now: new Date().toISOString(),
	});
	const created = await baasRest(config, fetchImpl, 'osionos_pages', {
		method: 'POST',
		body,
		prefer: 'return=representation',
	});
	json(response, 201, pageRowToEntry(Array.isArray(created) ? created[0] : created), config);
	return true;
}

const RECORD_PATH = /^\/api\/records\/([^/]+)\/([^/]+)\/([^/]+?)(\/open|\/subitems)?$/;

async function handleRecordsGet(url, request, response, config, fetchImpl) {
	const match = RECORD_PATH.exec(url.pathname);
	if (!match) return false;
	if (match[4] === '/subitems') return handleRecordSubitemsList(match, request, response, config, fetchImpl);
	if (match[4]) return false;
	return handleRecordRead(match, request, response, config, fetchImpl);
}

async function handleRecordsPost(url, request, response, config, fetchImpl) {
	const match = RECORD_PATH.exec(url.pathname);
	if (!match || !match[4]) return false;
	if (match[4] === '/subitems') return handleRecordSubitemCreate(match, request, response, config, fetchImpl);
	return handleRecordOpen(match, request, response, config, fetchImpl);
}

// ── Live databases (Databases navigator) ────────────────────────────────────
// The browser CANNOT reach /admin/v1/databases or /query/v1/:dbId/schema through
// Kong (anon key → 401). The bridge proxies these server-side: list via the
// adapter-registry (tenant-scoped), schema + rows via the query-router with the
// tenant api-key. Gated by a valid app session.

const DB_SCHEMA_PATH = /^\/api\/databases\/([^/]+)\/schema$/;
const DB_ROWS_PATH = /^\/api\/databases\/([^/]+)\/tables\/([^/]+)$/;
const DB_DDL_PATH = /^\/api\/databases\/([^/]+)\/schema\/ddl$/;
// Full CRUD: reads (list/get/aggregate) + writes (insert/update/delete/upsert/
// batch). The query-router enforces per-engine capability and owner-scopes every
// write to the tenant; every route below ALSO enforces the per-user mount ACL
// (resolveAccessibleMount / accessibleMountIds) so a caller can only reach a
// database linked to a workspace they own or belong to — databases are personal
// to a user unless invited via osionos_workspace_members.
const DB_OPS = new Set(['list', 'get', 'aggregate', 'insert', 'update', 'delete', 'upsert', 'batch']);

/** GET /api/databases?tenant= — databases linked to a workspace the caller belongs to. */
async function handleDatabaseList(url, request, response, config, fetchImpl) {
	// Membership scope: a caller only sees mounts linked to a workspace they own
	// or are a member of — NOT every database the tenant owns. (Also verifies the
	// app session.)
	const allowed = await accessibleMountIds(request, config, fetchImpl);
	// Tenant id: the bridge's own env wins (secure); else the client hint
	// (`?tenant=`, from VITE_BAAS_TENANT_ID — single-tenant dev). The registry
	// returns only db NAMES; schema/rows still require the bridge's tenant
	// api-key, so a wrong hint can never read another tenant's data.
	const tenantId = config.baasTenantId || (url.searchParams.get('tenant') ?? '').trim();
	const rows = await baasRegistryGet(config, fetchImpl, '/databases', tenantId);
	const databases = (Array.isArray(rows) ? rows : [])
		.map((row) => ({
			dbId: typeof row?.id === 'string' ? row.id : (typeof row?.dbId === 'string' ? row.dbId : ''),
			name: typeof row?.name === 'string' && row.name ? row.name : String(row?.id ?? ''),
			engine: typeof row?.engine === 'string' && row.engine ? row.engine : 'unknown',
		}))
		.filter((database) => database.dbId && allowed.has(database.dbId));
	json(response, 200, { databases }, config);
	return true;
}

/** GET /api/databases/:dbId/schema — engine-agnostic schema via the query-router. */
async function handleDatabaseSchema(match, request, response, config, fetchImpl) {
	const dbId = requireUuid(decodeURIComponent(match[1]), 'dbId');
	await resolveAccessibleMount(request, dbId, config, fetchImpl);
	let schema;
	try {
		schema = await baasQueryGet(config, fetchImpl, `/${dbId}/schema`);
	} catch (error) {
		// Schemaless engines (dynamodb, …) reject introspection (422
		// unsupported_capability). Surface that as an empty-but-OK schema so the
		// database still LISTS — just without tables — instead of failing the
		// whole mount. The frontend flags it via `capabilities.introspect`.
		const message = error instanceof Error ? error.message : '';
		if (/unsupported_capability|introspect/i.test(message)) {
			json(response, 200, { dbId, tables: [], capabilities: { introspect: false } }, config);
			return true;
		}
		throw error;
	}
	const base = schema && typeof schema === 'object' ? schema : { tables: [], engine: 'unknown' };
	json(response, 200, { dbId, ...base }, config);
	return true;
}

/** POST /api/databases/:dbId/tables/:table — CRUD (list/get/aggregate/insert/
 *  update/delete/upsert/batch) via the query-router, status passed through. */
async function handleDatabaseRows(match, request, response, config, fetchImpl) {
	const dbId = requireUuid(decodeURIComponent(match[1]), 'dbId');
	await resolveAccessibleMount(request, dbId, config, fetchImpl);
	const table = safeText(decodeURIComponent(match[2]), 120);
	if (!table) throw Object.assign(new Error('table is required.'), { status: 422 });
	const payload = await readJson(request).catch(() => ({}));
	const safe = payload && typeof payload === 'object' ? payload : {};
	// Reads AND writes. An unknown op falls back to a safe list; the status is
	// passed through so the write client can classify ok / conflict / rejected.
	const op = typeof safe.op === 'string' && DB_OPS.has(safe.op) ? safe.op : 'list';
	const { status, body } = await baasQueryPassthrough(config, fetchImpl, `/${dbId}/tables/${table}`, { ...safe, op });
	json(response, status || 502, body ?? { rows: [], affected_rows: 0 }, config);
	return true;
}

/** POST /api/databases/txn — atomic multi-op transaction (mount dbId in the body). */
async function handleDatabaseTxn(request, response, config, fetchImpl) {
	const payload = await readJson(request).catch(() => ({}));
	const safe = payload && typeof payload === 'object' ? payload : {};
	const dbId = requireUuid(typeof safe.mount === 'string' ? safe.mount : '', 'mount');
	await resolveAccessibleMount(request, dbId, config, fetchImpl);
	const { status, body } = await baasQueryPassthrough(config, fetchImpl, '/txn', safe);
	json(response, status || 502, body ?? {}, config);
	return true;
}

/** POST /api/databases/:dbId/schema/ddl — add/drop/alter a column (DDL). */
async function handleDatabaseDdl(match, request, response, config, fetchImpl) {
	const dbId = requireUuid(decodeURIComponent(match[1]), 'dbId');
	await resolveAccessibleMount(request, dbId, config, fetchImpl);
	const payload = await readJson(request).catch(() => ({}));
	const safe = payload && typeof payload === 'object' ? payload : {};
	const { status, body } = await baasQueryPassthrough(config, fetchImpl, `/${dbId}/schema/ddl`, safe);
	json(response, status || 502, body ?? {}, config);
	return true;
}

async function handleDatabasesGet(url, request, response, config, fetchImpl) {
	if (url.pathname === '/api/databases') return handleDatabaseList(url, request, response, config, fetchImpl);
	const schemaMatch = DB_SCHEMA_PATH.exec(url.pathname);
	if (schemaMatch) return handleDatabaseSchema(schemaMatch, request, response, config, fetchImpl);
	return false;
}

async function handleDatabasesPost(url, request, response, config, fetchImpl) {
	if (url.pathname === '/api/databases/txn') return handleDatabaseTxn(request, response, config, fetchImpl);
	const ddlMatch = DB_DDL_PATH.exec(url.pathname);
	if (ddlMatch) return handleDatabaseDdl(ddlMatch, request, response, config, fetchImpl);
	const rowsMatch = DB_ROWS_PATH.exec(url.pathname);
	if (rowsMatch) return handleDatabaseRows(rowsMatch, request, response, config, fetchImpl);
	return false;
}

async function handleGraphPages(url, request, response, config, fetchImpl) {
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	const requested = url.searchParams.get('workspaceId');
	const scopeAll = url.searchParams.get('scope') === 'all';
	// Default = the requested workspace only (workspace-scoped); `scope=all` = every
	// workspace the session owns; a workspace the session can't access yields none.
	const workspaceIds = scopeAll
		? authContext.workspaceIds
		: requested
			? (authContext.workspaceIds.includes(requested) ? [requested] : [])
			: authContext.workspaceIds;
	const rows = [];
	for (const workspaceId of workspaceIds) {
		const wsRows = await listPageRows(workspaceId, config, fetchImpl, {});
		for (const row of wsRows) {
			if (row.owner_id == null || row.owner_id === authContext.userId) rows.push(row);
		}
	}
	json(response, 200, pagesToGraph(rows), config);
	return true;
}

async function handlePagesGet(url, request, response, config, fetchImpl) {
	if (await handleMarketplaceGet(url, request, response, config, fetchImpl)) return true;
	if (await handleDatabasesGet(url, request, response, config, fetchImpl)) return true;
	if (url.pathname === '/api/graph/data') {
		return handleGraphData(url, request, response, config, fetchImpl);
	}
	if (await handleRecordsGet(url, request, response, config, fetchImpl)) return true;
	if (url.pathname === '/api/graph/pages') {
		return handleGraphPages(url, request, response, config, fetchImpl);
	}
	if (url.pathname === '/api/pages/search') {
		return handlePageSearch(url, request, response, config, fetchImpl);
	}
	if (url.pathname === '/api/pages' || url.pathname === '/api/pages/all') {
		return handlePageList(url, request, response, config, fetchImpl);
	}
	if (await handlePageConfigRead(url, request, response, config, fetchImpl)) return true;
	return handlePageRead(url, request, response, config, fetchImpl);
}

/** Workspace ids where the user has a members row (best-effort: [] on failure). */
async function memberWorkspaceIds(userId, config, fetchImpl) {
	try {
		const query = postgrestQuery({ user_id: `eq.${userId}`, select: 'workspace_id' });
		const rows = await baasRest(config, fetchImpl, `osionos_workspace_members?${query}`);
		return (Array.isArray(rows) ? rows : [])
			.map((row) => String(row.workspace_id))
			.filter((id) => UUID_REGEX.test(id));
	} catch {
		return [];
	}
}

async function handleWorkspaceGet(url, request, response, config, fetchImpl) {
	if (url.pathname === '/api/workspaces') {
		const authContext = verifyAppSessionToken(bearerToken(request), config);
		// Surface org/teamspace workspaces (osionos_workspace_members) alongside
		// the token's private workspace so the app sidebar can hydrate them.
		const memberIds = await memberWorkspaceIds(authContext.userId, config, fetchImpl);
		const workspaceIds = [...new Set([...authContext.workspaceIds, ...memberIds])];
		json(response, 200, await listSessionWorkspaces({ ...authContext, workspaceIds }, config, fetchImpl), config);
		return true;
	}
	const match = /^\/api\/workspaces\/([^/]+)$/.exec(url.pathname);
	if (!match) return false;
	const workspaceId = requireUuid(decodeURIComponent(match[1]), 'workspaceId');
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	if (!authContext.workspaceIds.includes(workspaceId)) {
		throw Object.assign(new Error('App session is not scoped to this workspace.'), { status: 403 });
	}
	const workspaces = await listSessionWorkspaces(authContext, config, fetchImpl);
	const workspace = workspaces.find((item) => item._id === workspaceId || item.id === workspaceId);
	if (!workspace) throw Object.assign(new Error('Workspace not found.'), { status: 404 });
	json(response, 200, workspace, config);
	return true;
}

async function handlePageCreate(request, response, config, fetchImpl) {
	const payload = await readJson(request, PAGE_JSON_BODY_LIMIT_BYTES);
	const workspaceId = requireUuid(payload.workspaceId, 'workspaceId');
	const authContext = await requireWorkspaceAccess(request, workspaceId, 'create', config, fetchImpl);
	const rows = await baasRest(config, fetchImpl, 'osionos_pages', {
		method: 'POST',
		body: pageCreateRowFromPayload(payload, authContext),
		prefer: 'return=representation',
	});
	json(response, 201, pageRowToEntry(Array.isArray(rows) ? rows[0] : rows), config);
	return true;
}

async function handleWorkspaceValidate(request, response, config, fetchImpl) {
	const payload = await readJson(request, PAGE_JSON_BODY_LIMIT_BYTES);
	const workspaceId = requireUuid(payload.workspaceId, 'workspaceId');
	const authContext = await requireWorkspaceAccess(request, workspaceId, normalizePermission(payload.permission), config, fetchImpl);
	json(response, 200, {
		ok: true,
		userId: authContext.userId,
		workspaceId: authContext.workspaceId,
		role: authContext.role,
		permissions: authContext.permissions,
	}, config);
	return true;
}

async function handlePageArchiveCascade(row, archivedAt, config, fetchImpl) {
	const refs = await listWorkspacePageRefs(row.workspace_id, config, fetchImpl);
	const descendantIds = descendantPageIds(refs, row.id);
	if (descendantIds.length === 0) return;
	await baasRest(config, fetchImpl, `osionos_pages?${idsFilter(descendantIds)}`, {
		method: 'PATCH',
		body: { archived_at: archivedAt, updated_at: new Date().toISOString() },
		prefer: 'return=minimal',
	});
}

async function handlePageUpdate(url, request, response, config, fetchImpl) {
	const pageId = pageIdFromPath(url.pathname);
	if (!pageId) return false;
	const existing = await fetchPageRow(pageId, config, fetchImpl);
	if (!existing) throw Object.assign(new Error('Page not found.'), { status: 404 });
	// The page OWNER may update their own page even when the workspace gate would
	// deny — e.g. a record-note that landed in a read-only seed workspace (ac3e…)
	// reached via the live MOUNT, not via that workspace's page role. Matches the
	// config/action handlers (requirePageScopeAccess → ownerOrWorkspaceAccess).
	// requirePageOwnership still runs, so a non-owner gains nothing (owner_id is
	// server-stamped — this never widens cross-user access).
	const access = await ownerOrWorkspaceAccess(request, existing, 'update', config, fetchImpl);
	requirePageOwnership(existing, access);

	const payload = await readJson(request, PAGE_JSON_BODY_LIMIT_BYTES);
	if (hasOwn(payload, 'workspaceId') && payload.workspaceId !== existing.workspace_id) {
		await requireWorkspaceAccess(request, payload.workspaceId, 'create', config, fetchImpl);
	}
	const updateRow = pageUpdateRowFromPayload(payload);
	const rows = await baasRest(config, fetchImpl, `osionos_pages?id=eq.${pageId}`, {
		method: 'PATCH',
		body: updateRow,
		prefer: 'return=representation',
	});
	const updated = Array.isArray(rows) ? rows[0] : rows;
	if (updated && hasOwn(updateRow, 'archived_at')) {
		await handlePageArchiveCascade(existing, updateRow.archived_at, config, fetchImpl);
	}
	json(response, 200, pageRowToEntry(updated), config);
	return true;
}

async function handlePageConfigPatch(url, request, response, config, fetchImpl) {
	const pageId = pageSubresourceIdFromPath(url.pathname, 'config');
	if (!pageId) return false;
	const payload = await readJson(request, PAGE_JSON_BODY_LIMIT_BYTES);
	const { authContext, workspaceId } = await requirePageScopeAccess(request, pageId, payload, 'update', config, fetchImpl);
	const pageConfig = safeJsonObject(payload.config, 'config');
	const rows = await baasRest(config, fetchImpl, 'osionos_page_configurations?on_conflict=user_id,page_id', {
		method: 'POST',
		body: {
			page_id: pageId,
			workspace_id: workspaceId,
			user_id: authContext.userId,
			config: pageConfig,
			updated_at: new Date().toISOString(),
		},
		prefer: 'resolution=merge-duplicates,return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	json(response, 200, { ok: true, pageId, config: row?.config ?? pageConfig, updatedAt: row?.updated_at ?? null }, config);
	return true;
}

async function handlePageActionCreate(url, request, response, config, fetchImpl) {
	const pageId = pageSubresourceIdFromPath(url.pathname, 'actions');
	if (!pageId) return false;
	const payload = await readJson(request);
	const { authContext, workspaceId } = await requirePageScopeAccess(request, pageId, payload, 'update', config, fetchImpl);
	const action = safeText(payload.action, 80);
	if (!action) throw Object.assign(new Error('Page action is required.'), { status: 422 });
	const rows = await baasRest(config, fetchImpl, 'osionos_page_action_events', {
		method: 'POST',
		body: {
			page_id: pageId,
			workspace_id: workspaceId,
			user_id: authContext.userId,
			action,
			payload: safeJsonObject(payload.payload, 'payload'),
		},
		prefer: 'return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	json(response, 201, { ok: true, eventId: row?.id ?? null, pageId, action }, config);
	return true;
}

async function handlePageTranslate(url, request, response, config, fetchImpl) {
	const pageId = pageSubresourceIdFromPath(url.pathname, 'translate');
	if (!pageId) return false;
	const payload = await readJson(request, PAGE_JSON_BODY_LIMIT_BYTES);
	const { row } = await requirePageScopeAccess(request, pageId, payload, 'read', config, fetchImpl);
	const targetLocale = safeTranslationLocale(payload.targetLocale);
	const cache = new Map();
	const sourceTitle = row ? row.title : safeText(payload.title, 500);
	const sourceContent = row ? safeJsonArray(row.content) : safeJsonArray(payload.content);
	json(response, 200, {
		ok: true,
		pageId,
		targetLocale,
		translatedAt: new Date().toISOString(),
		title: await translateText(sourceTitle, targetLocale, config, fetchImpl, cache),
		content: await Promise.all(sourceContent.map((block) => translateBlock(block, targetLocale, config, fetchImpl, cache))),
	}, config);
	return true;
}

async function handlePageDelete(url, request, response, config, fetchImpl) {
	const pageId = pageIdFromPath(url.pathname);
	if (!pageId) return false;
	const row = await fetchPageRow(pageId, config, fetchImpl);
	if (!row) throw Object.assign(new Error('Page not found.'), { status: 404 });
	const access = await ownerOrWorkspaceAccess(request, row, 'delete', config, fetchImpl);
	requirePageOwnership(row, access);
	const refs = await listWorkspacePageRefs(row.workspace_id, config, fetchImpl);
	const ids = [pageId, ...descendantPageIds(refs, pageId)];
	await baasRest(config, fetchImpl, `osionos_pages?${idsFilter(ids)}`, {
		method: 'DELETE',
		prefer: 'return=minimal',
	});
	json(response, 200, { ok: true, deletedIds: ids }, config);
	return true;
}

async function handlePagesPost(url, request, response, config, fetchImpl) {
	if (await handleMarketplacePost(url, request, response, config, fetchImpl)) return true;
	if (await handleDatabasesPost(url, request, response, config, fetchImpl)) return true;
	if (await handleRecordsPost(url, request, response, config, fetchImpl)) return true;
	if (url.pathname === '/api/pages') return handlePageCreate(request, response, config, fetchImpl);
	if (url.pathname === '/api/auth/workspace/validate') return handleWorkspaceValidate(request, response, config, fetchImpl);
	if (await handlePageActionCreate(url, request, response, config, fetchImpl)) return true;
	if (await handlePageTranslate(url, request, response, config, fetchImpl)) return true;
	return false;
}

async function handleBridgeGet(url, response, config, fetchImpl) {
	if (url.pathname === '/api/auth/bridge/health') {
		json(response, 200, { ok: true, service: 'osionos-bridge' }, config);
		return true;
	}
	if (url.pathname === '/api/geocode') {
		json(response, 200, await geocodePlaceName(url.searchParams.get('q') ?? '', fetchImpl), config);
		return true;
	}
	if (url.pathname !== '/api/media/unsplash/search') return false;
	json(response, 200, await searchUnsplashPhotos({
		query: url.searchParams.get('query') ?? url.searchParams.get('q') ?? undefined,
		perPage: url.searchParams.get('perPage') ?? url.searchParams.get('per_page') ?? undefined,
		orientation: url.searchParams.get('orientation') ?? undefined,
	}, config, fetchImpl), config);
	return true;
}

async function handleBridgeSession(request, response, config, handoffStore, replayStore, fetchImpl) {
	const rawPayload = await readJson(request);
	const payload = verifyBridgeRequest({
		headers: request.headers,
		payload: rawPayload,
		secret: config.sharedSecret,
		timestampSkewMs: config.timestampSkewMs,
		replayStore,
	});
	json(response, 200, await createBridgeHandoff({ payload, config, handoffStore, fetchImpl }), config);
}

async function handleBridgeConsume(request, response, config, handoffStore) {
	const payload = await readJson(request);
	const token = safeText(payload.token, 512);
	if (!token) throw Object.assign(new Error('Bridge handoff token is required.'), { status: 422 });
	json(response, 200, consumeHandoffToken(token, handoffStore), config);
}

function bridgeTokenFromRedirect(redirectUrl) {
	if (typeof redirectUrl !== 'string') return '';
	const hashIndex = redirectUrl.indexOf('#');
	if (hashIndex === -1) return '';
	return new URLSearchParams(redirectUrl.slice(hashIndex + 1)).get('bridge_token') ?? '';
}

async function gatewayCall(fetchImpl, config, path, { headers = {}, body = '{}' } = {}) {
	const res = await fetchWithTimeout(fetchImpl, `${config.gatewayUrl}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
		body,
	}, 12000);
	const data = await res.json().catch(() => ({}));
	return { res, data };
}

// Proxy the app's login/register to the hardened auth-gateway (server-side, so the
// gateway's website-only CORS does not apply), then mint + return the osionos
// session the app already consumes ({ user, accessToken, refreshToken }). Reuses
// the gateway hardening (lockout/policy) + its register-time workspace creation.
async function handleAuthProxy(url, request, response, config, handoffStore, fetchImpl) {
	if (!config.gatewayUrl) throw Object.assign(new Error('Auth gateway is not configured.'), { status: 503 });
	const payload = await readJson(request);
	const email = safeText(payload.email, 320).trim().toLowerCase();
	const password = safeText(payload.password, 512);
	if (!email || !password) throw Object.assign(new Error('Email and password are required.'), { status: 422 });
	const turnstileToken = 'localhost-turnstile-token';

	if (url.pathname === '/api/auth/register') {
		const rawName = safeText(payload.username ?? payload.name ?? email.split('@')[0], 64);
		const username = (rawName.replace(/[^\w.-]/g, '') || `user${Date.now()}`).slice(0, 32);
		const { res: rRes, data: rData } = await gatewayCall(fetchImpl, config, '/api/auth/register', {
			body: JSON.stringify({ email, password, turnstileToken, profile: { username, confirmPassword: password } }),
		});
		if (!rRes.ok) { json(response, rRes.status || 422, { message: rData.message || 'Registration failed.' }, config); return; }
	}

	const { res: lRes, data: lData } = await gatewayCall(fetchImpl, config, '/api/auth/login', {
		body: JSON.stringify({ email, password, turnstileToken }),
	});
	if (!lRes.ok || !lData.access_token) { json(response, lRes.status || 401, { message: lData.message || 'Invalid credentials.' }, config); return; }

	const { res: sRes, data: sData } = await gatewayCall(fetchImpl, config, '/api/auth/osionos-session', {
		headers: { authorization: `Bearer ${lData.access_token}` },
	});
	const bridgeToken = bridgeTokenFromRedirect(sData.redirectUrl);
	if (!sRes.ok || !bridgeToken) { json(response, 502, { message: sData.message || 'Could not establish the app session.' }, config); return; }

	const consumed = consumeHandoffToken(bridgeToken, handoffStore);
	json(response, 200, {
		user: { id: lData.user?.id ?? consumed.session.userId, email },
		accessToken: consumed.session.accessToken,
		refreshToken: typeof lData.refresh_token === 'string' ? lData.refresh_token : '',
		workspaceIds: Array.isArray(consumed.persona?.workspaceIds) ? consumed.persona.workspaceIds : [],
		session: consumed.session,
	}, config);
}

async function handleBridgePost(url, request, response, config, handoffStore, replayStore, fetchImpl) {
	if (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/register') {
		await handleAuthProxy(url, request, response, config, handoffStore, fetchImpl);
		return true;
	}
	if (url.pathname === '/api/agent/claude/stream') {
		await handleClaudeAgentStream(request, response, config);
		return true;
	}
	if (await handlePagesPost(url, request, response, config, fetchImpl)) return true;
	if (url.pathname === '/api/auth/bridge/session') {
		await handleBridgeSession(request, response, config, handoffStore, replayStore, fetchImpl);
		return true;
	}
	if (url.pathname !== '/api/auth/bridge/consume') return false;
	await handleBridgeConsume(request, response, config, handoffStore);
	return true;
}

async function handleBridgeRequest(request, response, context) {
	if (request.method === 'OPTIONS') {
		writeOptionsResponse(response, context.config);
		return;
	}
	const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
	// Workstream modules — each returns false when the path is not theirs:
	// in-chat AI agent (SSE), perms proxy (WS-C), LiveKit tokens (WS-D),
	// chat/profile/feed (WS-B).
	if (await context.social.agent(url, request, response, context.config)) return;
	if (await context.social.connector(url, request, response, context.config)) return;
		if (await context.social.oauth(url, request, response, context.config)) return;
	if (await handlePermsRoute(request, response, url, context.fetchImpl)) return;
	if (await context.social.rtc(url, request, response, context.config)) return;
	if (await context.social.chat(url, request, response, context.config)) return;
	if (await context.social.notify(url, request, response, context.config)) return;
	if (await context.social.community(url, request, response, context.config)) return;
	if (await context.social.profile(url, request, response, context.config)) return;
	if (await context.social.feed(url, request, response, context.config)) return;
	if (await context.social.social(url, request, response, context.config)) return;
	if (await context.social.collab(url, request, response, context.config)) return;
	if (request.method === 'GET' && await handleWorkspaceGet(url, request, response, context.config, context.fetchImpl)) return;
	if (request.method === 'GET' && await handlePagesGet(url, request, response, context.config, context.fetchImpl)) return;
	if (request.method === 'GET' && await handleBridgeGet(url, response, context.config, context.fetchImpl)) return;
	if (request.method === 'POST' && await handleBridgePost(
		url,
		request,
		response,
		context.config,
		context.handoffStore,
		context.replayStore,
		context.fetchImpl,
	)) return;
	if (request.method === 'PATCH' && await handleMarketplacePatch(url, request, response, context.config, context.fetchImpl)) return;
	if (request.method === 'PATCH' && await handlePageConfigPatch(url, request, response, context.config, context.fetchImpl)) return;
	if (request.method === 'PATCH' && await handlePageUpdate(url, request, response, context.config, context.fetchImpl)) return;
	if (request.method === 'DELETE' && await handlePageDelete(url, request, response, context.config, context.fetchImpl)) return;
	json(response, 404, { ok: false, message: 'Not found.' }, context.config);
}

export function createBridgeServer(options = {}) {
	const config = options.config ?? configFromEnv();
	const handoffStore = options.handoffStore ?? new Map();
	const replayStore = options.replayStore ?? new Map();
	const fetchImpl = options.fetchImpl ?? fetch;
	// Standalone workstream handlers, created once. rtc keeps the sibling
	// contract (closes over the base config); chat/profile/feed additionally
	// accept the per-request (per-origin) config at dispatch time.
	const social = options.social ?? {
		agent: createAgentHandler({ config, verifySession: verifyAppSessionToken, fetchImpl }),
		connector: createConnectorHandler({ config, verifySession: verifyAppSessionToken, fetchImpl }),
		oauth: createOAuthHandler({ config, verifySession: verifyAppSessionToken }),
		rtc: createRtcTokenHandler({ config, verifySession: verifyAppSessionToken, fetchImpl }),
		chat: createChatHandler({ config, verifySession: verifyAppSessionToken, fetchImpl }),
		notify: createNotifyHandler({ config, verifySession: verifyAppSessionToken, fetchImpl }),
		community: createCommunityHandler({ config, verifySession: verifyAppSessionToken, fetchImpl }),
		profile: createProfileHandler({ config, verifySession: verifyAppSessionToken, fetchImpl }),
		feed: createFeedHandler({ config, verifySession: verifyAppSessionToken, fetchImpl }),
		social: createSocialHandler({ config, verifySession: verifyAppSessionToken, fetchImpl }),
		collab: createCollabHandler({ config, verifySession: verifyAppSessionToken, fetchImpl }),
	};
	return createServer(async (request, response) => {
		let responseConfig = requestOriginConfig(config, request);
		try {
			await handleBridgeRequest(request, response, { config: responseConfig, handoffStore, replayStore, fetchImpl, social });
		} catch (error) {
			if (!response.headersSent) errorJson(response, error, responseConfig);
		}
	});
}

export function startBridgeServer(config = configFromEnv()) {
	const server = createBridgeServer({ config });
	server.listen(config.port, '0.0.0.0', () => {
		console.info(`[osionos-bridge] listening on 0.0.0.0:${config.port}`);
	});
	return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	startBridgeServer();
}