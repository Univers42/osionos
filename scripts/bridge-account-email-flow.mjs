/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-email-flow.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Add, resend, verify and remove of a secondary address, each behind sudo. The step-up code
 * goes to the PRIMARY address, so a stolen session without that mailbox cannot add one; the
 * proof of the new address is grobase's login-OTP proof, bound to the address the ROW holds
 * (never the body) and spent once.
 *
 * Caveat: the add-time and verify-time GoTrue check is read-then-write and the admin list is
 * one page; a full page with no exact match is treated as unprovable, never as absent.
 *
 * Caveat: the answer to add is uniform but not constant-time in the detached task; delivery
 * of the mail is observable by the mailbox owner only.
 */

import { writeAudit, requireSudo } from './bridge-guard.mjs';
import { accountError, clientMetaOf, maskAddress, noContent, readBody } from './bridge-account-sudo.mjs';
import { findAccountByEmail, readGotrueUser } from './bridge-gotrue-user.mjs';
import { chargeSend, chargeVerify, detach, isAvailable } from './bridge-account-email-send.mjs';
import { emailUnavailable, hmacOf, isUuid, normaliseAddress, openAddress } from './bridge-account-email-rows.mjs';
import { sendJson } from './bridge-social-core.mjs';

const CODE_SHAPE = /^[0-9]{6}$/;
const MAX_PENDING = 3;
const notFound = () => accountError(404, 'not_found', 'There is no email with that id.');
const taken = () => accountError(409, 'email_taken', 'That address cannot be added to this account.');

/** The record of a secondary, shaped like the EmailRecord the client reads. */
export const recordOf = (row, address) => ({
	_id: row.id, userId: row.user_id, email: address, isPrimary: false, verifiedAt: row.verified_at ?? null,
	createdAt: row.created_at, updatedAt: row.verified_at ?? row.created_at, removedAt: null,
});

const audit = (ctx, session, request, eventType) =>
	writeAudit(ctx.pg, { session, meta: clientMetaOf(request, ctx.config), eventType, details: {} });

/** Sudo first, then the key check: nothing touches the database before the grant is proven. */
export async function guardMutation(ctx, session) {
	await requireSudo(ctx.kv, session);
	if (!ctx.keysUsable) throw emailUnavailable();
}

async function primaryAddress(ctx, userId) {
	try {
		return String((await readGotrueUser(ctx, userId))?.email ?? '').trim().toLowerCase();
	} catch {
		throw emailUnavailable();
	}
}

/** A row of the caller that opens and matches its hash; anything else is a 404 with no oracle. */
async function ownRow(ctx, session, id) {
	if (id === `primary-${session.userId}`) throw accountError(409, 'primary_email', 'The primary address is changed, not removed.');
	if (!isUuid(id)) throw notFound();
	const row = await ctx.rows.get(session.userId, id);
	const address = row ? openAddress(row, ctx.env) : null;
	if (!address) throw notFound();
	return { row, address };
}

function scheduleMail(ctx, { userId, address, hmac, mailAllowed }) {
	detach(ctx, async () => {
		if (mailAllowed && (await isAvailable(ctx, { userId, address, hmac }))) await ctx.otp.requestCode(ctx, address);
	});
}

/** Two racing adds lose to the unique (user_id, email_hmac) index: the loser reuses the winner's row. */
async function insertOrReuse(ctx, userId, address, hmac) {
	try {
		return await ctx.rows.insert(userId, address);
	} catch (error) {
		const winner = error?.code === 'unique_violation' ? await ctx.rows.own(userId, hmac) : null;
		if (!winner) throw error;
		return winner;
	}
}

export async function addEmail(ctx, session, request, response) {
	const userId = session.userId;
	await guardMutation(ctx, session);
	const address = normaliseAddress((await readBody(request))?.email);
	if (!address) throw accountError(422, 'invalid_email', 'That is not an email address we can add.');
	if (address === await primaryAddress(ctx, userId)) throw accountError(409, 'already_primary', 'That is already your primary address.');
	const hmac = hmacOf(address, ctx.env);
	const mailAllowed = await chargeSend(ctx.kv, { userId, hmac, adding: true });
	await ctx.rows.sweep(userId, ctx.now());
	let row = await ctx.rows.own(userId, hmac);
	if (!row && (await ctx.rows.pendingCount(userId)) >= MAX_PENDING) throw accountError(409, 'too_many_pending', 'Verify or remove a pending address first.');
	await audit(ctx, session, request, 'account.email_add_requested');
	row ??= await insertOrReuse(ctx, userId, address, hmac);
	sendJson(response, 202, { id: row.id, sentTo: maskAddress(address) }, ctx.config);
	scheduleMail(ctx, { userId, address, hmac, mailAllowed: mailAllowed && !row.verified_at });
}

export async function resendEmail(ctx, session, request, response, id) {
	await guardMutation(ctx, session);
	const { row, address } = await ownRow(ctx, session, id);
	const hmac = hmacOf(address, ctx.env);
	const mailAllowed = await chargeSend(ctx.kv, { userId: session.userId, hmac, adding: false });
	await audit(ctx, session, request, 'account.email_code_requested');
	sendJson(response, 202, { sentTo: maskAddress(address) }, ctx.config);
	scheduleMail(ctx, { userId: session.userId, address, hmac, mailAllowed: mailAllowed && !row.verified_at });
}

/** After the proof, so `email_taken` and the unprovable 503 are only visible to a mailbox holder. */
async function assertAvailable(ctx, userId, address) {
	let found;
	try {
		found = await findAccountByEmail(ctx, address);
	} catch {
		throw emailUnavailable();
	}
	if (found.account?.emailConfirmed && found.account.id !== userId) throw taken();
	if (!found.account && !found.complete) throw emailUnavailable();
}

async function prove(ctx, session, request, address, code) {
	if (!ctx.secret) throw emailUnavailable();
	const proof = await ctx.otp.verifyCode(ctx, address, code);
	const checked = ctx.otp.checkProof(proof, { secret: ctx.secret, address, now: ctx.now() });
	await ctx.otp.spendProof(ctx.kv, proof, checked, ctx.now(), (fresh) => (fresh ? undefined : audit(ctx, session, request, 'account.email_proof_rejected')));
}

export async function verifyEmail(ctx, session, request, response, id) {
	await guardMutation(ctx, session);
	const { row, address } = await ownRow(ctx, session, id);
	if (row.verified_at) return sendJson(response, 200, recordOf(row, address), ctx.config);
	const body = await readBody(request);
	const code = typeof body?.code === 'string' ? body.code.trim() : '';
	return finishVerify(ctx, session, request, response, { row, address, code });
}

async function finishVerify(ctx, session, request, response, { row, address, code }) {
	const userId = session.userId;
	if (!CODE_SHAPE.test(code)) throw accountError(422, 'code_invalid', 'The code must be six digits.');
	await chargeVerify(ctx.kv, { userId, rowId: row.id, hmac: row.email_hmac });
	await prove(ctx, session, request, address, code);
	await assertAvailable(ctx, userId, address);
	let verified;
	try {
		verified = await ctx.rows.markVerified(userId, row.id, new Date(ctx.now()).toISOString());
	} catch (error) {
		if (error?.code !== 'unique_violation') throw error;
		await audit(ctx, session, request, 'account.email_verify_refused');
		throw taken();
	}
	await audit(ctx, session, request, 'account.email_verified');
	return sendJson(response, 200, recordOf(verified ?? (await ctx.rows.get(userId, row.id)), address), ctx.config);
}

export async function removeEmail(ctx, session, request, response, id) {
	await guardMutation(ctx, session);
	await ownRow(ctx, session, id);
	await audit(ctx, session, request, 'account.email_removed');
	if (!(await ctx.rows.remove(session.userId, id))) throw notFound();
	return noContent(response, ctx.config);
}
