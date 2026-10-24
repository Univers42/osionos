/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-stepup.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * A 2FA step-up starts a new refresh family, so the device that proved its factor stays
 * signed in when the aal2 access token ends. The insert calls `recordSession` (through
 * `recordDeliveredSession`) and the old family is revoked by `revokeFamily`; this module
 * writes nothing else (ADR 0003 rule 3, amended).
 *
 * The new family is NOT gated: a refresh inside it stays aal2 until the family expires or is
 * revoked (ADR 0009 names the exposure).
 * Caveat: insert-then-revoke is two writes, not one transaction. A crash between them leaves
 * two live families for this device until the old one expires; it is fail-safe (the old
 * family, if it was gated, still refreshes to aal1 only).
 * Caveat: the sudo carry-over reads the only readable expiry, `sudo-expires:<jti>`, which is
 * written best effort; a grant without it is not carried and the user is asked for sudo again.
 */

import { randomUUID } from 'node:crypto';
import { issueAal2 } from './bridge-account-mfa-state.mjs';
import { recordDeliveredSession, revokeFamily, sessionRowOf } from './bridge-sessions.mjs';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const revokedError = () => fail(401, 'session_revoked', 'This session was signed out; sign in again.');
const unavailableError = () => fail(503, 'session_record_unavailable', 'The session could not be recorded; try again shortly.');

/** Best effort: an unused new family must not stay live, but its failure must not mask the real error. */
async function abandon(deps, userId, familyId) {
	try {
		await revokeFamily(deps, { userId, familyId, rowId: familyId, reason: 'step_up' });
	} catch (error) {
		console.warn(`[osionos-bridge] 2fa: unused step-up family not revoked (${error.code ?? 'pg_failed'})`);
	}
}

/** Copies a still-running sudo window to the new jti with the time it has left; never creates or extends one. */
async function carrySudo(kv, { userId, oldJti, newJti, nowMs }) {
	try {
		if ((await kv.get(`sudo:${oldJti}`)) !== userId) return;
		const expires = await kv.get(`sudo-expires:${oldJti}`);
		const remaining = Date.parse(expires) - nowMs;
		if (!Number.isFinite(remaining) || remaining <= 0) return;
		await kv.set(`sudo:${newJti}`, userId, Math.ceil(remaining));
		await kv.set(`sudo-expires:${newJti}`, expires, Math.ceil(remaining));
	} catch {
		// Swallowed on purpose: the user is asked for sudo again, which is safe.
	}
}

/**
 * Mints the new family for an accepted code. Returns null while session records are off (the
 * caller then answers as before); throws 401 session_revoked when the old session is revoked
 * or another accepted verify already replaced it, and 503 session_record_unavailable when a
 * write fails: never a bare aal2 token without a refresh token.
 */
export async function startStepUpFamily({ config, pg, kv, request, session, nowMs }) {
	if (!config.sessionRecords?.enabled) return null;
	const deps = { config, pg };
	const oldJti = String(session.raw.jti).toLowerCase();
	let row;
	try {
		row = await sessionRowOf(pg, { sessionId: oldJti, userId: session.userId });
	} catch {
		throw unavailableError();
	}
	if (row?.revoked_at) throw revokedError();
	const newJti = randomUUID();
	const { token, expiresAt } = issueAal2(session, config, { nowMs, jti: newJti });
	const delivered = await recordDeliveredSession(config, pg, { request, accessToken: token, authMethod: 'refresh' });
	let revoked = 0;
	try {
		if (row) revoked = await revokeFamily(deps, { userId: session.userId, familyId: row.family_id, rowId: row.id, reason: 'step_up' });
	} catch {
		await abandon(deps, session.userId, newJti);
		throw unavailableError();
	}
	if (row && revoked === 0) {
		await abandon(deps, session.userId, newJti);
		throw revokedError();
	}
	await carrySudo(kv, { userId: session.userId, oldJti, newJti, nowMs });
	return { token, expiresAt, refreshToken: delivered.refreshToken };
}

/** The tokens a step-up answer carries: a new family, or the old session's own jti while records are off. */
export async function stepUpTokens(ctx, request, session, nowMs) {
	const family = await startStepUpFamily({ config: ctx.config, pg: ctx.pg, kv: ctx.kv, request, session, nowMs });
	if (family) return { accessToken: family.token, expiresAt: family.expiresAt, refreshToken: family.refreshToken };
	const { token, expiresAt } = issueAal2(session, ctx.config, { nowMs });
	return { accessToken: token, expiresAt };
}
