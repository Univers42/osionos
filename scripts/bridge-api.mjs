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
	resolve(APP_ROOT, '../../../apps/baas/.env.local'),
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
const PAGE_JSON_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_UNSPLASH_PER_PAGE = 12;
const MAX_UNSPLASH_PER_PAGE = 24;
const TRANSLATION_FETCH_TIMEOUT_MS = 6_000;
const BAAS_FETCH_TIMEOUT_MS = 2_500;
const MAX_CLAUDE_TOOL_RESULT_TEXT = 120_000;
const PAGE_VISIBILITY_VALUES = new Set(['private', 'shared', 'public']);
const PAGE_SURFACE_VALUES = new Set(['page', 'agent', 'home']);
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
	};
}

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

export function signAppSessionToken({ payload, workspace, config, now = Date.now(), jti = randomUUID() }) {
	if (!config.appSessionSecret) throw Object.assign(new Error('osionos app session secret is not configured.'), { status: 503 });
	const iat = Math.floor(now / 1000);
	const exp = iat + config.sessionTtlSeconds;
	const tokenPayload = {
		iss: 'osionos-bridge',
		aud: 'osionos-app',
		sub: payload.subject,
		provider: payload.provider,
		workspace_ids: [workspace._id],
		roles: { [workspace._id]: 'owner' },
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
		databaseId: row.database_id ?? null,
		archivedAt: row.archived_at ?? null,
		content: safeJsonArray(row.content),
		properties: safeJsonArray(row.properties),
		surface: PAGE_SURFACE_VALUES.has(row.surface) ? row.surface : undefined,
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
	return {
		workspace_id: workspaceId,
		parent_page_id: parentPageId === undefined ? null : parentPageId,
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
}

function pageUpdateRowFromPayload(payload) {
	const row = { updated_at: new Date().toISOString() };
	assignPayloadValue(row, payload, 'workspaceId', 'workspace_id', (value) => requireUuid(value, 'workspaceId'));
	assignPayloadValue(row, payload, 'parentPageId', 'parent_page_id', (value) => optionalUuid(value, 'parentPageId') ?? null);
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
 * may be mutated only by its OWNER, a workspace owner/admin, or an explicit collaborator
 * with editor/owner role. Today bridge sessions only ever hold their own single-owner
 * private workspace, so owner_id === access.userId always and this is a pass-through; it
 * future-proofs multi-user workspaces. Future work (shared workspaces): when real
 * multi-member shared/team workspaces land, align this with the client's canEditPage rule
 * (any member of a shared workspace may edit any page in it) so client and server agree.
 */
function requirePageOwnership(existing, access) {
	if (existing.owner_id == null) return; // legacy / unowned page — the workspace gate suffices
	if (existing.owner_id === access.userId) return; // the page owner
	if (access.role === 'owner' || access.role === 'admin') return; // workspace owner/admin
	const collaborators = Array.isArray(existing.collaborators) ? existing.collaborators : [];
	const role = collaborators.find((entry) => entry && entry.userId === access.userId)?.role;
	if (role === 'editor' || role === 'owner') return; // explicit page collaborator
	throw Object.assign(new Error('You do not have permission to modify this page.'), { status: 403 });
}

export async function requireWorkspaceAccess(request, workspaceId, permission, config, fetchImpl = fetch) {
	const normalizedWorkspaceId = requireUuid(workspaceId, 'workspaceId');
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	if (!authContext.workspaceIds.includes(normalizedWorkspaceId)) {
		throw Object.assign(new Error('App session is not scoped to this workspace.'), { status: 403 });
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

async function requirePageScopeAccess(request, pageId, payload, permission, config, fetchImpl = fetch) {
	const normalizedPageId = requirePageReference(pageId);
	const row = await fetchPageRowIfUuid(normalizedPageId, config, fetchImpl);
	if (row) {
		const authContext = await requireWorkspaceAccess(request, row.workspace_id, permission, config, fetchImpl);
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

export function createUserSession(payload, config, persisted = null, now = Date.now()) {
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
	const { token, expiresAt } = signAppSessionToken({ payload, workspace, config, now });
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
			workspaceIds: [workspace._id],
		},
		session: {
			userId,
			accessToken: token,
			refreshToken: '',
			privateWorkspaces: [workspace],
			sharedWorkspaces: [],
		},
	};
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
	const bridgeSession = createUserSession(payload, config, persisted, now);
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
		|| /^https?:\/\/tauri\.localhost$/i.test(origin)) {
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

async function handlePageRead(url, request, response, config, fetchImpl) {
	const pageId = pageIdFromPath(url.pathname);
	if (!pageId) return false;
	const row = await fetchPageRow(pageId, config, fetchImpl);
	if (!row) throw Object.assign(new Error('Page not found.'), { status: 404 });
	await requireWorkspaceAccess(request, row.workspace_id, 'read', config, fetchImpl);
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

/**
 * Owner-scoped page graph from the CANONICAL osionos_pages (replaces the duplicate
 * Mongo og_notes as the graph's note source). Returns the viewer's own pages as a
 * BaaS graph (note nodes + parent + tag edges). Owner-scoping is authoritative here:
 * we only include rows the caller owns, so the graph never leaks another user's pages.
 */
async function handleGraphPages(request, response, config, fetchImpl) {
	const authContext = verifyAppSessionToken(bearerToken(request), config);
	const rows = [];
	for (const workspaceId of authContext.workspaceIds) {
		const wsRows = await listPageRows(workspaceId, config, fetchImpl, {});
		for (const row of wsRows) {
			if (row.owner_id == null || row.owner_id === authContext.userId) rows.push(row);
		}
	}
	json(response, 200, pagesToGraph(rows), config);
	return true;
}

async function handlePagesGet(url, request, response, config, fetchImpl) {
	if (url.pathname === '/api/graph/pages') {
		return handleGraphPages(request, response, config, fetchImpl);
	}
	if (url.pathname === '/api/pages' || url.pathname === '/api/pages/all') {
		return handlePageList(url, request, response, config, fetchImpl);
	}
	if (await handlePageConfigRead(url, request, response, config, fetchImpl)) return true;
	return handlePageRead(url, request, response, config, fetchImpl);
}

async function handleWorkspaceGet(url, request, response, config, fetchImpl) {
	if (url.pathname === '/api/workspaces') {
		const authContext = verifyAppSessionToken(bearerToken(request), config);
		json(response, 200, await listSessionWorkspaces(authContext, config, fetchImpl), config);
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
	const access = await requireWorkspaceAccess(request, existing.workspace_id, 'update', config, fetchImpl);
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
	const access = await requireWorkspaceAccess(request, row.workspace_id, 'delete', config, fetchImpl);
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

async function handleBridgePost(url, request, response, config, handoffStore, replayStore, fetchImpl) {
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
	return createServer(async (request, response) => {
		let responseConfig = requestOriginConfig(config, request);
		try {
			await handleBridgeRequest(request, response, { config: responseConfig, handoffStore, replayStore, fetchImpl });
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