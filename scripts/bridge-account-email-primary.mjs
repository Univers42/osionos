/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-email-primary.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/account/emails/:id/primary: a verified secondary becomes the sign-in address.
 * Behind sudo (spent by the change), a per-user lock and budget. Order: refusals, spend the
 * grant, keep the old primary as a verified secondary, audit, GoTrue's admin PUT, then the
 * secondary row goes and every other sign-in ends. A failure the PUT is KNOWN not to have
 * survived undoes the kept row and gives the grant back; an unknown one is settled by a re-read.
 *
 * Caveat: the GoTrue admin PUT has no duplicate check of its own, so the promote-time lookup
 * is read-then-write; the loser of a race gets GoTrue's 23505, answered as `email_taken`. An
 * address added to OSIONOS_ADMIN_EMAILS AFTER it became someone's primary promotes that account
 * at its next sign-in, as for any account. A process kill between the PUT and the row removal
 * leaves a secondary equal to the primary; the GET hides it. A PUT that times out can still land
 * after the re-read; the kept row and the GET mask make that harmless, other sign-ins are not ended
 * in that case. Ends bridge sessions only: GoTrue refresh tokens issued before the change stay
 * valid (probe 2026-10-24). The lock release is a plain `del`
 * (kv has no compare-and-delete): a run that outlives the lock's TTL can delete the lock a
 * later run took, letting a third run in; the promote-time lookup and GoTrue's 23505 still hold.
 */

import { writeAudit, grantSudo } from './bridge-guard.mjs';
import { accountError, clientMetaOf } from './bridge-account-sudo.mjs';
import { findAccountByEmail, readGotrueUser, updateGotrueEmail } from './bridge-gotrue-user.mjs';
import { userBudget } from './bridge-account-email-send.mjs';
import { endOtherSignIns } from './bridge-account-password.mjs';
import { guardMutation, ownRow, recordOf } from './bridge-account-email-flow.mjs';
import { emailUnavailable, hmacOf } from './bridge-account-email-rows.mjs';
import { sendJson } from './bridge-social-core.mjs';

const LOCK_TTL_MS = 60_000;
const BUDGET = { limit: 5, windowMs: 600_000 };
const taken = () => accountError(409, 'email_taken', 'That address cannot be made primary on this account.');
const lower = (value) => String(value ?? '').trim().toLowerCase();
const jtiOf = (session) => String(session.raw.jti).toLowerCase();

async function acquireLock(ctx, session) {
	const key = `email-primary:${session.userId}`;
	let held;
	try {
		held = await ctx.kv.setNx(key, jtiOf(session), LOCK_TTL_MS);
	} catch (error) {
		throw emailUnavailable(error);
	}
	if (!held) throw accountError(409, 'primary_busy', 'Another change of your primary address is running.');
	return () => ctx.kv.del(key).catch(() => {});
}

/** The promote-time checks: the add-time ones are old by now, and GoTrue's unique index sees unconfirmed accounts too. */
async function assertPromotable(ctx, userId, address) {
	if (ctx.config.adminEmails.includes(address)) throw taken();
	let found;
	try {
		found = await findAccountByEmail(ctx, address);
	} catch (error) {
		throw emailUnavailable(error);
	}
	if (found.account && found.account.id !== userId) throw taken();
	if (!found.account && !found.complete) throw emailUnavailable();
}

/** Marks the caller's own row verified; null when another user verified the address in between. */
async function reuseOwn(ctx, userId, hmac) {
	const own = await ctx.rows.own(userId, hmac);
	if (!own) return null;
	if (own.verified_at) return own;
	try {
		return (await ctx.rows.markVerified(userId, own.id, new Date(ctx.now()).toISOString())) ?? own;
	} catch (error) {
		if (error?.code === 'unique_violation') return null;
		throw error;
	}
}

/** The old primary, kept as a verified secondary only on evidence: GoTrue confirmed it and nobody else verified it. */
async function keepPrevious(ctx, userId, previous, confirmed) {
	const none = { id: null, created: false };
	if (previous === '' || !confirmed) return none;
	const hmac = hmacOf(previous, ctx.env);
	if (await ctx.rows.verifiedByOther(userId, hmac)) return none;
	try {
		return { id: (await ctx.rows.insertVerified(userId, previous, new Date(ctx.now()).toISOString())).id, created: true };
	} catch (error) {
		if (error?.code !== 'unique_violation') throw error;
		return { id: (await reuseOwn(ctx, userId, hmac))?.id ?? null, created: false };
	}
}

async function undo(ctx, session, kept) {
	if (kept.created) await ctx.rows.remove(session.userId, kept.id).catch((error) => ctx.log('account_email_primary_undo_failed', error?.code ?? 'unknown'));
	await grantSudo(ctx.kv, session).catch(() => {}); // best effort: a lost grant only costs a new code
}

/**
 * `rollback` (delete the kept row, give the grant back) is true only when the PUT is known not
 * to have landed. After an unknown outcome the kept row stays; `restoreSudo` alone gives the grant back.
 */
async function writeAddress(ctx, userId, address, previous) {
	let code = null;
	try {
		await updateGotrueEmail(ctx, userId, address);
		return { failure: null, rollback: false, restoreSudo: false };
	} catch (error) {
		code = error?.code;
	}
	if (code === 'gotrue_email_taken') return { failure: taken(), rollback: true, restoreSudo: true };
	if (code === 'gotrue_write_failed') return { failure: emailUnavailable(), rollback: true, restoreSudo: true };
	try {
		const current = lower((await readGotrueUser(ctx, userId))?.email);
		if (current === address) return { failure: null, rollback: false, restoreSudo: false };
		return { failure: emailUnavailable(), rollback: false, restoreSudo: current === previous };
	} catch {
		return { failure: emailUnavailable(), rollback: false, restoreSudo: true };
	}
}

async function finish(ctx, session, request, response, { row, address, kept }) {
	const logged = (what) => (error) => ctx.log(what, error?.code ?? 'unknown');
	await ctx.rows.remove(session.userId, row.id).catch(logged('account_email_primary_remove_failed'));
	await writeAudit(ctx.pg, { session, meta: clientMetaOf(request, ctx.config), eventType: 'account.email_primary_changed', details: {} }).catch(logged('account_email_primary_audit_failed'));
	try {
		await endOtherSignIns(ctx, session, response, 'logout_all');
	} catch {
		throw accountError(503, 'email_changed_signout_failed', 'Your primary address HAS changed, but other devices could not be signed out. Sign them out from your sessions list.');
	}
	const at = new Date(ctx.now()).toISOString();
	return sendJson(response, 200, { primary: { ...recordOf(row, address), isPrimary: true, verifiedAt: at, updatedAt: at }, previous: kept.id }, ctx.config);
}

async function promote(ctx, session, request, response, id) {
	const { userId } = session;
	const { row, address } = await ownRow(ctx, session, id);
	if (!row.verified_at) throw accountError(409, 'email_unverified', 'Verify this address before making it primary.');
	let user;
	try {
		user = await readGotrueUser(ctx, userId);
	} catch (error) {
		throw emailUnavailable(error);
	}
	const previous = lower(user?.email);
	if (address === previous) throw accountError(409, 'already_primary', 'That is already your primary address.');
	await assertPromotable(ctx, userId, address);
	let granted;
	try {
		granted = await ctx.kv.getDel(`sudo:${jtiOf(session)}`);
	} catch (error) {
		throw emailUnavailable(error);
	}
	if (granted !== userId) throw accountError(403, 'sudo_required', 'Sudo is required for this action.');
	let kept = { id: null, created: false };
	let outcome;
	try {
		kept = await keepPrevious(ctx, userId, previous, typeof user?.email_confirmed_at === 'string' && user.email_confirmed_at !== '');
		// Audit first: a failure here leaves GoTrue untouched.
		await writeAudit(ctx.pg, { session, meta: clientMetaOf(request, ctx.config), eventType: 'account.email_primary_requested', details: {} });
		outcome = await writeAddress(ctx, userId, address, previous);
	} catch (error) {
		await undo(ctx, session, kept);
		throw error;
	}
	if (outcome.failure) {
		if (outcome.rollback) await undo(ctx, session, kept);
		else if (outcome.restoreSudo) await grantSudo(ctx.kv, session).catch(() => {});
		throw outcome.failure;
	}
	return finish(ctx, session, request, response, { row, address, kept });
}

export async function makePrimary(ctx, session, request, response, id) {
	await guardMutation(ctx, session);
	const release = await acquireLock(ctx, session);
	try {
		await userBudget(ctx.kv, ['email-primary', session.userId], BUDGET);
		return await promote(ctx, session, request, response, id);
	} finally {
		await release();
	}
}
