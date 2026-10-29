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
 * counter, a client that retries through a block extends it (each refused attempt counts, up to
 * the 15 min cap and the one-hour window), and an attacker rotating addresses is slowed only by the per-address limit and the
 * per-user audit signal; no account is ever locked, so the owner can always sign in.
 */

import { verifyAppSessionToken, signAppSessionToken } from './bridge-session-token.mjs';
import { writeAudit } from './bridge-guard.mjs';

export const TOTP_TABLE = 'osionos_mfa_totp';
export const CODES_TABLE = 'osionos_mfa_recovery_codes';
/** One verify bucket for TOTP and recovery codes: both answer the same second-factor prompt. */
export const VERIFY_LIMIT = { limit: 30, windowMs: 60_000 };
const FAIL_WINDOW_MS = 3_600_000;
const BLOCK_AFTER = 5;
const BLOCK_BASE_MS = 30_000;
const BLOCK_CAP_MS = 900_000;
const SUSPECT_AFTER = 50;

const unavailable = (cause) => Object.assign(new Error('Two-step verification is unavailable; try again shortly.'), { status: 503, code: 'mfa_unavailable', cause });

/**
 * The gate is off only when the bridge has no BaaS to ask. With a BaaS URL but no service key
 * the lookup cannot run, and that is a 503 at sign-in, never a silent aal 2.
 */
export const mfaGateEnabled = (config) => Boolean(config?.baasUrl);

function keyState(env) {
	const text = env?.OSIONOS_MFA_SECRET_KEY;
	if (!text) return 'unset';
	return Buffer.from(String(text), 'base64').length === 32 ? 'set' : 'invalid';
}

function pepperState(env) {
	const text = env?.OSIONOS_RECOVERY_PEPPER;
	if (!text) return 'unset';
	return Buffer.from(String(text), 'base64').length === 32 ? 'set' : 'invalid';
}

/** Names and states only, never a value. */
export const mfaBootLine = (config, env = process.env) => `[osionos-bridge] mfa_gate=${mfaGateEnabled(config) ? 'on' : 'off'} mfa_key=${keyState(env)} recovery_pepper=${pepperState(env)} client_ip_header=${config?.clientIpHeader ? 'set' : 'unset'}`;

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
	if (!config.serviceKey || typeof pg?.asService !== 'function') throw unavailable();
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
 * The same session at aal 2 with the same expiry, so a step-up never extends it. The jti is
 * the old one unless the caller names a new one (a step-up that starts a new refresh family
 * needs its own row id). Workspaces and roles come from the token
 * being upgraded, not from a fresh read, so nothing is re-granted.
 */
export function issueAal2(session, config, { nowMs, jti = session.raw.jti }) {
	const raw = session.raw;
	const [privateWorkspace, ...others] = session.workspaceIds;
	return signAppSessionToken({
		payload: { subject: session.userId, provider: raw.provider },
		workspace: { _id: privateWorkspace },
		config,
		now: nowMs,
		jti,
		memberWorkspaces: others.map((id) => ({ _id: id, role: raw.roles?.[id] })),
		platformRole: session.platformRole,
		isAdmin: session.isAdmin,
		aal: 2,
		exp: raw.exp,
	});
}

// Without a client address header every caller is "no address": the bucket is still this user's own, never shared.
const lockoutKey = (userId, meta) => `${userId}:${meta?.ipHash ?? meta?.ipPrefix ?? 'no-address'}`;

/** Throws 429 with the time left while this (user, address) is blocked. */
export async function assertNotBlocked(kv, userId, meta, nowMs) {
	const until = Number(await kv.get(`mfa-block:${lockoutKey(userId, meta)}`));
	// A store that failed to expire the key must not block for ever: the stored expiry decides.
	if (Number.isFinite(until) && until > nowMs) {
		throw Object.assign(new Error('Too many wrong codes; try again later.'), { status: 429, code: 'mfa_locked', retryAfterSeconds: Math.ceil((until - nowMs) / 1000) });
	}
}

/**
 * Counts an attempt BEFORE its code is compared, so a parallel burst cannot out-run the block:
 * the fifth attempt is the last one to reach the compare until the block expires. Throws 429
 * for any attempt past it. A success clears the count.
 */
export async function countAttempt({ kv, session, meta, nowMs }) {
	const key = lockoutKey(session.userId, meta);
	const attempts = await kv.incrWithTtl(`mfa-fail:${key}`, FAIL_WINDOW_MS);
	if (attempts < BLOCK_AFTER) return;
	const blockMs = Math.min(BLOCK_BASE_MS * 2 ** (attempts - BLOCK_AFTER), BLOCK_CAP_MS);
	await kv.setNx(`mfa-block:${key}`, String(nowMs + blockMs), blockMs);
	if (attempts > BLOCK_AFTER) throw Object.assign(new Error('Too many wrong codes; try again later.'), { status: 429, code: 'mfa_locked', retryAfterSeconds: Math.ceil(blockMs / 1000) });
}

/** The per-user signal that never blocks: one audit row at fifty wrong codes an hour. */
export async function recordFailure({ kv, pg, session, meta }) {
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
