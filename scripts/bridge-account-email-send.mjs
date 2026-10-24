/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-email-send.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The budgets and the detached mail of the secondary-email flow. grobase has no per-address
 * limit and mails whatever address it is given, so the bridge owns three layers: per user
 * (429, own-account state), per target address and global (both silent: the answer stays
 * the same and only the mail is withheld, so a counter never tells a caller whether an
 * address is taken).
 *
 * Caveat: the windows are fixed (2x the limit can pass across a boundary) and the global
 * send cap of 60/hour is shared by every user of the bridge, so a busy stack withholds
 * mail without telling anyone. The detached task is not constant-time; delivery is
 * observable only by the mailbox owner. A task that fails is logged by code and the row
 * stays until the 1-hour sweep.
 */

import { findAccountByEmail } from './bridge-gotrue-user.mjs';
import { accountError } from './bridge-account-sudo.mjs';
import { rateLimit } from './bridge-guard.mjs';
import { emailUnavailable } from './bridge-account-email-rows.mjs';

const HOUR = 3_600_000;
const DAY = 86_400_000;

async function overBy(kv, parts, options) {
	try {
		await rateLimit(kv, parts, options);
		return null;
	} catch (error) {
		if (error?.status === 429) return error;
		throw emailUnavailable(error);
	}
}

/** A per-user limit: over it is the caller's own 429. */
export async function userBudget(kv, parts, options) {
	const over = await overBy(kv, parts, options);
	if (over) throw over;
}

/** A shared limit: false when over it, so the caller withholds work instead of answering. */
export async function sharedBudget(kv, parts, options) {
	return (await overBy(kv, parts, options)) === null;
}

/** Charges every send counter; true when the mail may go out. Counters advance whatever the address is. */
export async function chargeSend(kv, { userId, hmac, adding }) {
	if (adding) {
		await userBudget(kv, ['email-add', userId], { limit: 5, windowMs: 600_000 });
		await userBudget(kv, ['email-add', userId, 'day'], { limit: 20, windowMs: DAY });
	}
	await userBudget(kv, ['email-send', userId], { limit: 5, windowMs: 600_000 });
	const targetOk = await sharedBudget(kv, ['email-target', hmac], { limit: 3, windowMs: HOUR });
	const globalOk = await sharedBudget(kv, ['email-send', 'global'], { limit: 60, windowMs: HOUR });
	return targetOk && globalOk;
}

/** Charges the verify counters; the per-target one bounds a brute force of a third party's code. */
export async function chargeVerify(kv, { userId, rowId, hmac }) {
	await userBudget(kv, ['email-verify', userId, rowId], { limit: 10, windowMs: HOUR });
	await userBudget(kv, ['email-verify-target', hmac], { limit: 10, windowMs: DAY });
	if (!(await sharedBudget(kv, ['email-verify', 'global'], { limit: 300, windowMs: HOUR }))) {
		throw accountError(503, 'email_busy', 'Email verification is busy; try again later.');
	}
}

/** True when a code may be mailed for the address: no other verified owner, no other confirmed primary. */
export async function isAvailable({ rows, config, fetchImpl }, { userId, address, hmac }) {
	if (await rows.verifiedByOther(userId, hmac)) return false;
	const { account, complete } = await findAccountByEmail({ config, fetchImpl }, address);
	if (account) return !(account.emailConfirmed && account.id !== userId);
	return complete;
}

/** Runs the task after the answer; its failure is logged by code and never reaches anyone. */
export function detach({ track, log }, task) {
	const done = Promise.resolve().then(task).catch((error) => log('account_email_task_failed', error?.code ?? 'unknown'));
	void track(done);
}
