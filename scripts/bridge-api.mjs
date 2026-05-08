#!/usr/bin/env node
import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIR, '..');

for (const file of [
	resolve(APP_ROOT, '.env.local'),
	resolve(APP_ROOT, '.env'),
	resolve(APP_ROOT, '../../../.env.local'),
	resolve(APP_ROOT, '../../opposite-osiris/.env.local'),
	resolve(APP_ROOT, '../../opposite-osiris/.env'),
	resolve(APP_ROOT, '../../../infrastructure/baas/.env.local'),
]) {
	if (!existsSync(file)) continue;
	for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
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
const BRIDGE_FIELDS = new Set(['provider', 'subject', 'email', 'name', 'jti']);
const SENSITIVE_FIELD_PATTERN = /password|pass|secret|service|role|key|jwt|token|cookie|consent|birth|city|address|phone|profile|metadata|database|connection/i;
const DEFAULT_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_HANDOFF_TTL_MS = 90 * 1000;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60;
const DEFAULT_UNSPLASH_PER_PAGE = 12;
const MAX_UNSPLASH_PER_PAGE = 24;

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

export async function persistBridgeIdentity(payload, config, fetchImpl = fetch) {
	const persistenceEnabled = config.persistence === 'baas' || (config.persistence === 'auto' && config.serviceKey && config.baasUrl);
	if (!persistenceEnabled) return null;
	const response = await fetchImpl(`${config.baasUrl}/rest/v1/rpc/osionos_bridge_upsert_workspace`, {
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
	});
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

async function readJson(request) {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
		if (body.length > 16_384) throw Object.assign(new Error('Request body too large.'), { status: 413 });
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

function errorJson(response, error, config) {
	json(response, error.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Bridge request failed.' }, config);
}

export function createBridgeServer(options = {}) {
	const config = options.config ?? configFromEnv();
	const handoffStore = options.handoffStore ?? new Map();
	const replayStore = options.replayStore ?? new Map();
	const fetchImpl = options.fetchImpl ?? fetch;
	return createServer(async (request, response) => {
		try {
			if (request.method === 'OPTIONS') {
				response.writeHead(204, {
					'access-control-allow-origin': config.allowedOrigin,
					'access-control-allow-credentials': 'true',
					'access-control-allow-methods': 'GET, POST, OPTIONS',
					'access-control-allow-headers': 'content-type, authorization, x-prismatica-bridge-timestamp, x-prismatica-bridge-signature',
					vary: 'Origin',
				});
				response.end();
				return;
			}
			const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
			if (request.method === 'GET' && url.pathname === '/api/auth/bridge/health') {
				json(response, 200, { ok: true, service: 'osionos-bridge' }, config);
				return;
			}
			if (request.method === 'GET' && url.pathname === '/api/media/unsplash/search') {
				json(response, 200, await searchUnsplashPhotos({
					query: url.searchParams.get('query') ?? url.searchParams.get('q') ?? undefined,
					perPage: url.searchParams.get('perPage') ?? url.searchParams.get('per_page') ?? undefined,
					orientation: url.searchParams.get('orientation') ?? undefined,
				}, config, fetchImpl), config);
				return;
			}
			if (request.method === 'POST' && url.pathname === '/api/auth/bridge/session') {
				const rawPayload = await readJson(request);
				const payload = verifyBridgeRequest({
					headers: request.headers,
					payload: rawPayload,
					secret: config.sharedSecret,
					timestampSkewMs: config.timestampSkewMs,
					replayStore,
				});
				json(response, 200, await createBridgeHandoff({ payload, config, handoffStore, fetchImpl }), config);
				return;
			}
			if (request.method === 'POST' && url.pathname === '/api/auth/bridge/consume') {
				const payload = await readJson(request);
				const token = safeText(payload.token, 512);
				if (!token) throw Object.assign(new Error('Bridge handoff token is required.'), { status: 422 });
				json(response, 200, consumeHandoffToken(token, handoffStore), config);
				return;
			}
			json(response, 404, { ok: false, message: 'Not found.' }, config);
		} catch (error) {
			errorJson(response, error, config);
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