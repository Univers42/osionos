// The osionos_v1 app-session token: the bridge signs it, osionos-ai verifies it.
// Both import this module, so it must stay free of I/O and of imports from the
// bridge's API module: such an import would cycle and drag the whole bridge in.
// The helpers the token code needs live here for the same reason: one copy, imported back.

import { Buffer } from 'node:buffer';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { assertSessionNotCutOff, tokenIssuedAtMs } from './bridge-session-cutoff.mjs';
import { assertSessionNotRevoked } from './bridge-session-revocations.mjs';
import { isPlatformRole } from './bridge-roles.mjs';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const APP_SESSION_TOKEN_VERSION = 'osionos_v1';

/**
 * The config the token code reads: the secret the signature is made with, the
 * TTL of a token, and the cut-off tracker of the process (the bridge and the
 * osionos-ai service both pass theirs).
 *
 * @typedef {object} AppSessionConfig
 * @property {string} appSessionSecret
 * @property {number} sessionTtlSeconds
 * @property {import('./bridge-session-cutoff.mjs').SessionCutoffTracker} [sessionCutoffs]
 * @property {{ status: () => string, isRevoked: (sessionId: string) => boolean }} [sessionRevocations] the per-session revocation tracker; absent means not enforced in this process
 */

/**
 * The private workspace of the user: the one the token is minted for.
 *
 * @typedef {object} AppSessionWorkspace
 * @property {string} _id
 */

/**
 * A workspace the user is a member of: its id, and the role of the member.
 *
 * @typedef {object} AppSessionMemberWorkspace
 * @property {string} _id
 * @property {string} role
 */

/**
 * A minted token, and the moment it expires.
 *
 * @typedef {object} SignedAppSessionToken
 * @property {string} token
 * @property {string} expiresAt
 */

/**
 * A verified token, as its consumers read it: the user, the workspaces, the
 * role of each of them, the admin flag, and the raw payload.
 *
 * @typedef {object} VerifiedAppSessionToken
 * @property {string} userId
 * @property {string[]} workspaceIds
 * @property {Record<string, string>} roles
 * @property {string | null} platformRole admin | moderator | user | guest, or null for a token minted before the claim
 * @property {boolean} isAdmin
 * @property {Record<string, unknown>} raw
 */

/** Constant-time comparison of two texts; the app-session signature is base64url, not hex. */
export function safeCompareText(left, right) {
	const leftBuffer = Buffer.from(String(left ?? ''), 'utf8');
	const rightBuffer = Buffer.from(String(right ?? ''), 'utf8');
	return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/** Unicode-normalised, control-character-free text, clipped to `limit`. */
export function safeText(value, limit) {
	return String(value ?? '')
		.normalize('NFKC')
		.replaceAll(/(?![\u0080-\u009f])\p{Cc}/gu, '')
		.trim()
		.slice(0, limit);
}

function base64url(input) {
	return Buffer.from(input).toString('base64url');
}

/**
 * Mints the token the bridge hands to the app: the subject, the provider, the
 * private workspace, and the workspaces the user is a member of.
 *
 * @param {object} options
 * @param {{ subject: string, provider: string }} options.payload who the token is for
 * @param {AppSessionWorkspace} options.workspace the private workspace of the user
 * @param {AppSessionConfig} options.config the secret, the TTL, the cut-off tracker
 * @param {number} [options.now] the moment the token is minted, in milliseconds
 * @param {string} [options.jti] the id of the token
 * @param {AppSessionMemberWorkspace[]} [options.memberWorkspaces] the other workspaces of the user
 * @param {string | null} [options.platformRole] the platform role; it decides is_admin
 * @param {boolean} [options.isAdmin] whether the user is an administrator, for callers that pass no role
 * @returns {SignedAppSessionToken}
 */
export function signAppSessionToken({ payload, workspace, config, now = Date.now(), jti = randomUUID(), memberWorkspaces = [], platformRole = null, isAdmin = false }) {
	if (!config.appSessionSecret) throw Object.assign(new Error('osionos app session secret is not configured.'), { status: 503 });
	const iat = Math.floor(now / 1000);
	const exp = iat + config.sessionTtlSeconds;
	const memberRoles = Object.fromEntries(memberWorkspaces.map((entry) => [entry._id, safeText(entry.role, 16) || 'member']));
	// One source: the role names the admin, so the two claims can never disagree.
	const role = isPlatformRole(platformRole) ? platformRole : (isAdmin === true ? 'admin' : null);
	const tokenPayload = {
		iss: 'osionos-bridge',
		aud: 'osionos-app',
		sub: payload.subject,
		provider: payload.provider,
		workspace_ids: [workspace._id, ...memberWorkspaces.map((entry) => entry._id)],
		roles: { ...memberRoles, [workspace._id]: 'owner' },
		platform_role: role,
		is_admin: role === 'admin',
		jti,
		iat,
		// Milliseconds: a cut-off and a token minted in the same second must still be ordered.
		iat_ms: Math.floor(now),
		exp,
	};
	const encodedPayload = base64url(JSON.stringify(tokenPayload));
	const signature = createHmac('sha256', config.appSessionSecret).update(encodedPayload).digest('base64url');
	return { token: `osionos_v1.${encodedPayload}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/**
 * Checks the signature, the audience and the expiry of a token, and refuses
 * the ones minted before their user's sign-out and the sessions revoked one by one
 * (when the process holds a revocation tracker).
 *
 * @param {string} token the token of the request
 * @param {AppSessionConfig} config the secret, the TTL, the cut-off tracker
 * @param {number} [now] the moment of the check, in milliseconds; defaults to the bridge's clock
 *   (config.sessionCutoffs.now), then the wall clock
 * @returns {VerifiedAppSessionToken}
 */
export function verifyAppSessionToken(token, config, now = undefined) {
	const resolvedNow = now ?? config?.sessionCutoffs?.now?.() ?? Date.now();
	if (!config.appSessionSecret) throw Object.assign(new Error('osionos app session secret is not configured.'), { status: 503 });
	const parts = safeText(token, 4096).split('.');
	const [version, encodedPayload, signature] = parts;
	if (parts.length !== 3 || version !== APP_SESSION_TOKEN_VERSION || !encodedPayload || !signature) {
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
	if (!Number.isFinite(exp) || exp <= Math.floor(resolvedNow / 1000)) {
		throw Object.assign(new Error('App session token has expired.'), { status: 401 });
	}
	assertSessionNotCutOff(config.sessionCutoffs, String(payload.sub).toLowerCase(), tokenIssuedAtMs(payload));
	assertSessionNotRevoked(config.sessionRevocations, String(payload.jti ?? '').toLowerCase());
	const workspaceIds = Array.isArray(payload.workspace_ids)
		? payload.workspace_ids.map(String).filter((workspaceId) => UUID_REGEX.test(workspaceId))
		: [];
	if (workspaceIds.length === 0) {
		throw Object.assign(new Error('App session token has no workspace access.'), { status: 401 });
	}
	// is_admin applies only to tokens with no platform_role (rolling deploy); a valid claim wins. (C2, C6)
	const isAdmin = isPlatformRole(payload.platform_role)
		? payload.platform_role === 'admin'
		: payload.is_admin === true;
	return {
		userId: String(payload.sub).toLowerCase(),
		workspaceIds,
		roles: payload.roles && typeof payload.roles === 'object' && !Array.isArray(payload.roles) ? payload.roles : {},
		// A token minted before the claim existed answers no role, not the admin bit.
		platformRole: isPlatformRole(payload.platform_role) ? payload.platform_role : null,
		isAdmin,
		raw: payload,
	};
}
