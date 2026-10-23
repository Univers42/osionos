/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-mfa.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/account/2fa/enroll | verify | disable, GET /api/account/2fa/status.
 *
 * Enrolment is two steps: enroll stores a sealed secret as `pending`, the first valid code
 * from verify flips it to `verified`. A pending factor gates nothing, so a user who abandons
 * the dialog is never locked out. Confirming (and disabling) first writes a session cut-off,
 * so every token minted before the change dies, and only then changes the factor row; the
 * caller gets back a fresh aal2 token for its own session.
 * Caveat: the cut-off also ends the refresh family of the session that enrolled, so that
 * browser signs in again at its next refresh (and is born aal1). A cut-off written before a
 * failed row flip, or a failed revoke of the personal access tokens, leaves the user signed out
 * everywhere with the factor still pending.
 * Caveat: the cut-off reaches this instance at once but other instances only through their
 * poller (every 10 s), so a token minted before the change still verifies there for up to that
 * long, the same window as a sign-out.
 * Caveat: a code of the next step is accepted and burns the replay counter, so
 * a +1-step code refuses the current-step code for up to 30 s.
 */

import { writeSessionCutoff } from './bridge-session-cutoff.mjs';
import { revokeAllPats } from './bridge-pat-store.mjs';
import { accountError, callerSession, clientMetaOf, readBody, respondWithError } from './bridge-account-sudo.mjs';
import { rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';
import { sendJson } from './bridge-social-core.mjs';
import { CODES_TABLE, TOTP_TABLE, VERIFY_LIMIT, assertNotBlocked, clearFailures, countAttempt, issueAal2, mfaUnavailable, readFactor, recordFailure, verifyStepUp } from './bridge-account-mfa-state.mjs';
import { recoveryRemaining } from './bridge-account-mfa-recovery.mjs';
import { matchStep, newSecret, openSecret, otpauthUrl, sealSecret } from './bridge-account-mfa-totp.mjs';

const ISSUER = 'osionos';

const rowFilter = (userId, extra = {}) => `${new URLSearchParams({ user_id: `eq.${userId}`, ...extra })}`;

/** A factor-table write that fails is an outage of the feature, not the caller's mistake. */
async function guardedWrite(operation) {
	try {
		return await operation();
	} catch (error) {
		throw mfaUnavailable(error);
	}
}

async function cutAllSessions({ config, fetchImpl }, userId, atMs) {
	await writeSessionCutoff(config, fetchImpl, userId, atMs);
	config.sessionCutoffs?.applyLocal(userId, atMs * 1000);
}

/**
 * The session list hides rows older than the cut-off, so the session that was just upgraded
 * is re-dated to the cut-off.
 * Caveat: best effort; on failure the session works but is missing from the sessions list.
 */
async function redateSession({ pg }, session, atMs) {
	try {
		await pg.asService().patch(`osionos_sessions?${rowFilter(session.userId, { family_id: `eq.${session.raw.jti}` })}`, { created_at: new Date(atMs).toISOString() }, { prefer: 'return=minimal' });
	} catch (error) {
		console.warn(`[osionos-bridge] 2fa: session row not re-dated (${error.code ?? 'pg_failed'})`);
	}
}

function upgraded(ctx, session, atMs, response) {
	const { token, expiresAt } = issueAal2(session, ctx.config, { nowMs: atMs });
	return sendJson(response, 200, { ok: true, accessToken: token, expiresAt, aal: 2 }, ctx.config);
}

async function status(ctx, request, response) {
	const session = callerSession(request, ctx.config, verifyStepUp);
	const row = await readFactor(ctx.pg, session.userId);
	const remaining = await recoveryRemaining(ctx.pg, session.userId);
	return sendJson(response, 200, { enabled: row?.status === 'verified', methods: ['totp'], recoveryRemaining: remaining, aal: session.aal }, ctx.config);
}

async function enroll(ctx, request, response) {
	const session = callerSession(request, ctx.config, ctx.verifySession);
	await requireSudo(ctx.kv, session);
	const secret = newSecret();
	const sealed = sealSecret(secret, session.userId, ctx.env);
	const existing = await readFactor(ctx.pg, session.userId);
	if (existing?.status === 'verified') throw accountError(409, 'already_enrolled', 'Two-step verification is already on; turn it off first.');
	await writeAudit(ctx.pg, { session, meta: clientMetaOf(request, ctx.config), eventType: 'account.2fa.enrol', details: { method: 'totp' } });
	const fresh = { secret_enc: sealed, last_step: 0, created_at: new Date(ctx.clock()).toISOString() };
	const written = await guardedWrite(() => (existing
		? ctx.pg.asService().patch(`${TOTP_TABLE}?${rowFilter(session.userId, { status: 'eq.pending' })}`, fresh, { prefer: 'return=representation' })
		: ctx.pg.asService().post(TOTP_TABLE, { user_id: session.userId, status: 'pending', ...fresh }, { prefer: 'return=minimal' })));
	// A verify that flipped the row meanwhile leaves nothing to replace: never hand out a secret that was not stored.
	if (existing && (!Array.isArray(written) || written.length === 0)) throw accountError(409, 'enrolment_changed', 'The enrolment changed while you were setting it up; start again.');
	return sendJson(response, 200, { otpauthUrl: otpauthUrl({ secret, account: session.userId, issuer: ISSUER }) }, ctx.config);
}

/** pending -> verified. The cut-off comes first: a failed cut-off must leave the factor pending. */
async function confirm(ctx, request, session, step, meta) {
	const atMs = ctx.clock();
	await writeAudit(ctx.pg, { session, meta, eventType: 'account.2fa.confirm', details: { method: 'totp' } });
	await cutAllSessions(ctx, session.userId, atMs);
	// Before the flip: a personal access token minted before the factor existed must not outlive the change, and a failure here leaves the factor pending.
	await guardedWrite(() => revokeAllPats({ pg: ctx.pg, userId: session.userId, now: new Date(atMs).toISOString() }));
	const flipped = await guardedWrite(() => ctx.pg.asService().patch(
		`${TOTP_TABLE}?${rowFilter(session.userId, { status: 'eq.pending' })}`,
		{ status: 'verified', verified_at: new Date(atMs).toISOString(), last_step: step },
		{ prefer: 'return=representation' },
	));
	if (!Array.isArray(flipped) || flipped.length === 0) throw accountError(409, 'enrolment_changed', 'The enrolment changed while you were verifying; start again.');
	await redateSession(ctx, session, atMs);
	return atMs;
}

/** The replay guard: one conditional write that only the first request for a step can win. */
async function claimStep(ctx, userId, step) {
	const won = await guardedWrite(() => ctx.pg.asService().patch(
		`${TOTP_TABLE}?${rowFilter(userId, { status: 'eq.verified', last_step: `lt.${step}` })}`,
		{ last_step: step },
		{ prefer: 'return=representation' },
	));
	return Array.isArray(won) && won.length === 1;
}

async function verify(ctx, request, response) {
	const session = callerSession(request, ctx.config, verifyStepUp);
	const { code } = await readBody(request);
	const meta = clientMetaOf(request, ctx.config);
	const address = meta.ipHash ?? meta.ipPrefix;
	await rateLimit(ctx.kv, address ? ['mfa-verify', 'ip', address] : ['mfa-verify', 'user', session.userId], VERIFY_LIMIT);
	await assertNotBlocked(ctx.kv, session.userId, meta, ctx.clock());
	await countAttempt({ kv: ctx.kv, session, meta, nowMs: ctx.clock() });
	const row = await readFactor(ctx.pg, session.userId);
	if (!row) throw accountError(409, 'not_enrolled', 'Two-step verification is not set up.');
	const secret = openSecret(row.secret_enc, session.userId, ctx.env);
	const step = matchStep({ secret, code, nowMs: ctx.clock(), lastStep: Number(row.last_step) || 0 });
	const accepted = step !== null && (row.status === 'pending' || await claimStep(ctx, session.userId, step));
	if (!accepted) {
		await recordFailure({ kv: ctx.kv, pg: ctx.pg, session, meta });
		throw accountError(422, 'code_invalid', 'That code is not valid.');
	}
	const atMs = row.status === 'pending' ? await confirm(ctx, request, session, step, meta) : ctx.clock();
	await clearFailures(ctx.kv, session.userId, meta);
	return upgraded(ctx, session, atMs, response);
}

async function disable(ctx, request, response) {
	const session = callerSession(request, ctx.config, ctx.verifySession);
	await requireSudo(ctx.kv, session);
	const atMs = ctx.clock();
	await writeAudit(ctx.pg, { session, meta: clientMetaOf(request, ctx.config), eventType: 'account.2fa.disable', details: { method: 'totp' } });
	await cutAllSessions(ctx, session.userId, atMs);
	await guardedWrite(async () => {
		// Codes first: a failure between the two leaves a factor without codes, never codes without a factor.
		await ctx.pg.asService().del(`${CODES_TABLE}?${rowFilter(session.userId)}`);
		await ctx.pg.asService().del(`${TOTP_TABLE}?${rowFilter(session.userId)}`);
	});
	await redateSession(ctx, session, atMs);
	return upgraded(ctx, session, atMs, response);
}

const ROUTES = new Map([
	['GET /api/account/2fa/status', status],
	['POST /api/account/2fa/enroll', enroll],
	['POST /api/account/2fa/verify', verify],
	['POST /api/account/2fa/disable', disable],
]);

export function createMfaRoutes({ config, pg, kv, verifySession, env = process.env, fetchImpl = fetch, now = null }) {
	const clock = () => Math.floor((now ?? config.sessionCutoffs?.now ?? Date.now)());
	const ctx = { config, pg, kv, verifySession, env, fetchImpl, clock };
	return async function handleMfaRequest(url, request, response) {
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
