/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-mfa-recovery.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/account/2fa/recovery/generate | regenerate | verify.
 *
 * Ten single-use codes are the way back in when the authenticator is lost. They are shown
 * once, in the response that creates them, and stored only as HMAC-SHA256 under a server
 * pepper that the database does not hold, so a database leak alone cannot be ground offline.
 * A code is spent by one conditional write (`used_at` still null, row returned), so two
 * parallel requests with one code cannot both win. A regeneration inserts the new set under a
 * higher `generation` first and sweeps the older generations second, so a crash leaves old and
 * new codes, never none. Verify shares the lockout and the rate limit of the authenticator.
 * Caveat: two concurrent generate calls can each pass the "no set yet" check and leave two
 * sets of ten (both valid, only one returned to each caller); a regenerate then collapses them.
 * Caveat: a regenerate whose sweep fails answers 503 without the new codes, which stay live
 * and unseen until the next regenerate removes them.
 * Caveat: the audit row of a spent code is written after the spend (it records the codes left),
 * and a failed audit write is logged, not fatal: it must not strand a code the user has used.
 */

import { randomInt, createHmac } from 'node:crypto';
import { accountError, callerSession, clientMetaOf, readBody, respondWithError } from './bridge-account-sudo.mjs';
import { rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';
import { sendJson } from './bridge-social-core.mjs';
import { VERIFY_LIMIT } from './bridge-account-mfa.mjs';
import { issueAal2, assertNotBlocked, clearFailures, countAttempt, CODES_TABLE, mfaUnavailable, readFactor, recordFailure, verifyStepUp } from './bridge-account-mfa-state.mjs';

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const HALF = 4;
const SET_SIZE = 10;
const PEPPER_BYTES = 32;
const CODE_SHAPE = new RegExp(`^[${ALPHABET}]{${HALF * 2}}$`);

const pick = () => ALPHABET[randomInt(ALPHABET.length)];
const half = () => Array.from({ length: HALF }, pick).join('');

/** Ten distinct `xxxx-xxxx` codes. */
export function newRecoveryCodes() {
	const codes = new Set();
	while (codes.size < SET_SIZE) codes.add(`${half()}-${half()}`);
	return [...codes];
}

/** The canonical form that is hashed, or null when the input cannot be a code. */
export function normaliseRecoveryCode(input) {
	if (typeof input !== 'string') return null;
	const text = input.toLowerCase().replaceAll('-', '');
	return CODE_SHAPE.test(text) ? text : null;
}

export function hashRecoveryCode({ pepper, userId, code }) {
	const normalised = normaliseRecoveryCode(code);
	if (normalised === null) throw new TypeError('not a recovery code');
	return createHmac('sha256', Buffer.from(pepper, 'base64')).update(`${userId.toLowerCase()}:${normalised}`).digest('hex');
}

function pepperOf(env) {
	const text = env?.OSIONOS_RECOVERY_PEPPER;
	if (!text || Buffer.from(String(text), 'base64').length !== PEPPER_BYTES) throw mfaUnavailable();
	return String(text);
}

const filter = (userId, extra = {}) => `${CODES_TABLE}?${new URLSearchParams({ user_id: `eq.${userId.toLowerCase()}`, ...extra })}`;

/** A store failure is an outage of the feature, not the caller's mistake. */
async function guarded(operation) {
	try {
		return await operation();
	} catch (error) {
		throw mfaUnavailable(error);
	}
}

async function readRows(pg, path) {
	const rows = await guarded(() => pg.asService().get(path));
	if (!Array.isArray(rows)) throw mfaUnavailable();
	return rows;
}

/** The unused codes of the newest generation; 0 when the user has none. */
export async function recoveryRemaining(pg, userId) {
	const rows = await readRows(pg, filter(userId, { select: 'generation,used_at' }));
	const newest = Math.max(0, ...rows.map((row) => Number(row.generation) || 0));
	return rows.filter((row) => (Number(row.generation) || 0) === newest && row.used_at == null).length;
}

async function requireVerifiedFactor(pg, userId) {
	const factor = await readFactor(pg, userId);
	if (factor?.status !== 'verified') throw accountError(409, 'not_enrolled', 'Turn on two-step verification before creating recovery codes.');
}

/** One bulk POST: PostgREST runs it as one statement, so a failure leaves no half-written set. */
async function insertSet({ pg, userId, pepper, generation }) {
	const codes = newRecoveryCodes();
	const rows = codes.map((code) => ({ user_id: userId, code_hmac: hashRecoveryCode({ pepper, userId, code }), generation }));
	await guarded(() => pg.asService().post(CODES_TABLE, rows, { prefer: 'return=minimal' }));
	return codes;
}

function shown(ctx, response, codes) {
	return sendJson(response, 200, { ok: true, codes, remaining: codes.length }, ctx.config);
}

async function generate(ctx, request, response) {
	const session = callerSession(request, ctx.config, ctx.verifySession);
	const pepper = pepperOf(ctx.env);
	await requireVerifiedFactor(ctx.pg, session.userId);
	if ((await readRows(ctx.pg, filter(session.userId, { select: 'id', limit: '1' }))).length > 0) throw accountError(409, 'codes_exist', 'You already have recovery codes; regenerate them to get a new set.');
	await writeAudit(ctx.pg, { session, meta: clientMetaOf(request, ctx.config), eventType: 'account.2fa.recovery.generate', details: { count: SET_SIZE } });
	return shown(ctx, response, await insertSet({ pg: ctx.pg, userId: session.userId, pepper, generation: 1 }));
}

async function regenerate(ctx, request, response) {
	const session = callerSession(request, ctx.config, ctx.verifySession);
	await requireSudo(ctx.kv, session);
	const pepper = pepperOf(ctx.env);
	await requireVerifiedFactor(ctx.pg, session.userId);
	const generations = (await readRows(ctx.pg, filter(session.userId, { select: 'generation' }))).map((row) => Number(row.generation) || 0);
	const generation = Math.max(0, ...generations) + 1;
	await writeAudit(ctx.pg, { session, meta: clientMetaOf(request, ctx.config), eventType: 'account.2fa.recovery.regenerate', details: { count: SET_SIZE } });
	const codes = await insertSet({ pg: ctx.pg, userId: session.userId, pepper, generation });
	await guarded(() => ctx.pg.asService().del(filter(session.userId, { generation: `lt.${generation}` })));
	return shown(ctx, response, codes);
}

const invalidCode = () => accountError(422, 'code_invalid', 'That code is not valid.');

/** Unknown, used and malformed codes all end here, with one body. */
async function refuse(ctx, session, meta) {
	await recordFailure({ kv: ctx.kv, pg: ctx.pg, session, meta });
	throw invalidCode();
}

async function spend(ctx, userId, hmac) {
	const won = await guarded(() => ctx.pg.asService().patch(filter(userId, { code_hmac: `eq.${hmac}`, used_at: 'is.null' }), { used_at: new Date(ctx.clock()).toISOString() }, { prefer: 'return=representation' }));
	return Array.isArray(won) && won.length === 1;
}

async function auditSpend(ctx, session, meta, remaining) {
	try {
		await writeAudit(ctx.pg, { session, meta, eventType: 'account.2fa.recovery.verify', details: { method: 'recovery', remaining } });
	} catch (error) {
		console.warn(`[osionos-bridge] 2fa: recovery spend not audited (${error.code ?? 'audit_failed'})`);
	}
}

async function verify(ctx, request, response) {
	const session = callerSession(request, ctx.config, verifyStepUp);
	const { code } = await readBody(request);
	const meta = clientMetaOf(request, ctx.config);
	const pepper = pepperOf(ctx.env);
	const address = meta.ipHash ?? meta.ipPrefix;
	await rateLimit(ctx.kv, address ? ['mfa-verify', 'ip', address] : ['mfa-verify', 'user', session.userId], VERIFY_LIMIT);
	await assertNotBlocked(ctx.kv, session.userId, meta, ctx.clock());
	await countAttempt({ kv: ctx.kv, session, meta, nowMs: ctx.clock() });
	if (normaliseRecoveryCode(code) === null) return refuse(ctx, session, meta);
	const before = await recoveryRemaining(ctx.pg, session.userId);
	if (!(await spend(ctx, session.userId, hashRecoveryCode({ pepper, userId: session.userId, code })))) return refuse(ctx, session, meta);
	const remaining = Math.max(0, before - 1);
	await auditSpend(ctx, session, meta, remaining);
	await clearFailures(ctx.kv, session.userId, meta);
	const { token, expiresAt } = issueAal2(session, ctx.config, { nowMs: ctx.clock() });
	return sendJson(response, 200, { ok: true, accessToken: token, expiresAt, aal: 2, remaining }, ctx.config);
}

const ROUTES = new Map([
	['POST /api/account/2fa/recovery/generate', generate],
	['POST /api/account/2fa/recovery/regenerate', regenerate],
	['POST /api/account/2fa/recovery/verify', verify],
]);

export function createMfaRecoveryRoutes({ config, pg, kv, verifySession, env = process.env, now = null }) {
	const clock = () => Math.floor((now ?? config.sessionCutoffs?.now ?? Date.now)());
	const ctx = { config, pg, kv, verifySession, env, clock };
	return async function handleRecoveryRequest(url, request, response) {
		const route = ROUTES.get(`${request.method} ${url.pathname}`);
		if (!route) return false;
		try {
			await route(ctx, request, response);
		} catch (error) {
			respondWithError(response, error, config);
		}
		return true;
	};
}
