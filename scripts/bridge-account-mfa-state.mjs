/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-mfa-state.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the bridge knows about a user's second factor, in one place: is the gate on, does this
 * user owe a factor, the step-up token, and the failure counters.
 *
 * Fail closed: any thrown lookup error is a failure (503), only a successful empty list means
 * "no factor". A missing relation reads as a failure on purpose: a deploy that forgot the
 * migration must not silently turn the second factor off for everyone.
 * Caveat: the lockout is keyed on (user, client address). Callers behind one NAT share a
 * counter, and an attacker rotating addresses is slowed only by the per-address limit and the
 * per-user audit signal; no account is ever locked, so the owner can always sign in.
 */

import { verifyAppSessionToken, signAppSessionToken } from './bridge-session-token.mjs';
import { writeAudit } from './bridge-guard.mjs';

export const TOTP_TABLE = 'osionos_mfa_totp';
export const CODES_TABLE = 'osionos_mfa_recovery_codes';
const FAIL_WINDOW_MS = 3_600_000;
const BLOCK_AFTER = 5;
const BLOCK_BASE_MS = 30_000;
const BLOCK_CAP_MS = 900_000;
const SUSPECT_AFTER = 50;

const unavailable = (cause) => Object.assign(new Error('Two-step verification is unavailable; try again shortly.'), { status: 503, code: 'mfa_unavailable', cause });

/** Caveat: without service-role access the bridge cannot ask, so the gate is off and every token is aal 2. */
export const mfaGateEnabled = (config) => Boolean(config?.baasUrl && config?.serviceKey);

export const mfaBootLine = (config) => `[osionos-bridge] mfa_gate=${mfaGateEnabled(config) ? 'on' : 'off'}`;

const factorQuery = (userId, extra) => `${TOTP_TABLE}?${new URLSearchParams({ user_id: `eq.${userId.toLowerCase()}`, ...extra })}`;

async function readRows(pg, path) {
	let rows;
	try {
		rows = await pg.asService().get(path);
	} catch (error) {
		throw unavailable(error);
	}
	if (!Array.isArray(rows)) throw unavailable();
	return rows;
}

/** True when the user has a verified factor. A pending enrolment does not gate sign-in. */
export async function mfaRequiredFor({ pg, config }, userId) {
	if (!mfaGateEnabled(config)) return false;
	if (typeof pg?.asService !== 'function') throw unavailable();
	return (await readRows(pg, factorQuery(userId, { status: 'eq.verified', select: 'user_id', limit: '1' }))).length > 0;
}

/** The user's factor row (pending or verified), or null. */
export async function readFactor(pg, userId) {
	const rows = await readRows(pg, factorQuery(userId, { select: 'user_id,secret_enc,status,last_step,created_at', limit: '1' }));
	return rows[0] ?? null;
}

/** The verifier for the routes that must work while the second factor is still owed. */
export const verifyStepUp = (token, config) => verifyAppSessionToken(token, config, undefined, { allowPendingMfa: true });

/**
 * The same session at aal 2: same jti and expiry, so a step-up neither extends nor forks the
 * session and sudo (keyed on the jti) carries over. Workspaces and roles come from the token
 * being upgraded, not from a fresh read, so nothing is re-granted.
 */
export function issueAal2(session, config, { nowMs }) {
	const raw = session.raw;
	const [privateWorkspace, ...others] = session.workspaceIds;
	return signAppSessionToken({
		payload: { subject: session.userId, provider: raw.provider },
		workspace: { _id: privateWorkspace },
		config,
		now: nowMs,
		jti: raw.jti,
		memberWorkspaces: others.map((id) => ({ _id: id, role: raw.roles?.[id] })),
		platformRole: session.platformRole,
		isAdmin: session.isAdmin,
		aal: 2,
		exp: raw.exp,
	});
}

function lockoutKey(userId, meta) {
	const address = meta?.ipHash ?? meta?.ipPrefix;
	if (!address) throw unavailable();
	return `${userId}:${address}`;
}

/** Throws 429 with the time left while this (user, address) is blocked. */
export async function assertNotBlocked(kv, userId, meta, nowMs) {
	const until = Number(await kv.get(`mfa-block:${lockoutKey(userId, meta)}`));
	// A store that failed to expire the key must not block for ever: the stored expiry decides.
	if (Number.isFinite(until) && until > nowMs) {
		throw Object.assign(new Error('Too many wrong codes; try again later.'), { status: 429, code: 'mfa_locked', retryAfterSeconds: Math.ceil((until - nowMs) / 1000) });
	}
}

/** Counts a wrong code: the per-address block, and the per-user signal that never blocks. */
export async function recordFailure({ kv, pg, session, meta, nowMs }) {
	const key = lockoutKey(session.userId, meta);
	const failures = await kv.incrWithTtl(`mfa-fail:${key}`, FAIL_WINDOW_MS);
	if (failures >= BLOCK_AFTER) {
		const blockMs = Math.min(BLOCK_BASE_MS * 2 ** (failures - BLOCK_AFTER), BLOCK_CAP_MS);
		await kv.setNx(`mfa-block:${key}`, String(nowMs + blockMs), blockMs);
	}
	const spread = await kv.incrWithTtl(`mfa-fail-user:${session.userId}`, FAIL_WINDOW_MS);
	if (spread === SUSPECT_AFTER) {
		try {
			await writeAudit(pg, { session, meta, eventType: 'account.2fa.bruteforce_suspected', details: { failuresPerHour: spread } });
		} catch (error) {
			console.warn(`[osionos-bridge] mfa bruteforce signal could not be audited: ${error.code ?? 'audit_failed'}`);
		}
	}
}

export async function clearFailures(kv, userId, meta) {
	await kv.getDel(`mfa-fail:${lockoutKey(userId, meta)}`);
}

export const mfaUnavailable = unavailable;
