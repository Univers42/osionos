// The osionos_v1 app-session token: the bridge signs it, osionos-ai verifies it.
// Both import this module, so it must stay free of I/O and of imports from the
// bridge's API module: such an import would cycle and drag the whole bridge in.
// The helpers the token code needs live here for the same reason: one copy, imported back.

import { Buffer } from 'node:buffer';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { assertSessionNotCutOff, tokenIssuedAtMs } from './bridge-session-cutoff.mjs';

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
 * @param {boolean} [options.isAdmin] whether the user is an administrator
 * @returns {SignedAppSessionToken}
 */
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
 * the ones minted before their user's sign-out.
 *
 * @param {string} token the token of the request
 * @param {AppSessionConfig} config the secret, the TTL, the cut-off tracker
 * @param {number} [now] the moment of the check, in milliseconds
 * @returns {VerifiedAppSessionToken}
 */
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
	assertSessionNotCutOff(config.sessionCutoffs, String(payload.sub).toLowerCase(), tokenIssuedAtMs(payload));
	const workspaceIds = Array.isArray(payload.workspace_ids)
		? payload.workspace_ids.map(String).filter((workspaceId) => UUID_REGEX.test(workspaceId))
		: [];
	if (workspaceIds.length === 0) {
		throw Object.assign(new Error('App session token has no workspace access.'), { status: 401 });
	}
	return {
		userId: String(payload.sub).toLowerCase(),
		workspaceIds,
		roles: payload.roles && typeof payload.roles === 'object' && !Array.isArray(payload.roles) ? payload.roles : {},
		isAdmin: payload.is_admin === true,
		raw: payload,
	};
}
