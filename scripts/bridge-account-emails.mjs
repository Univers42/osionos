/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-emails.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * /api/account/emails: the caller's primary address (GoTrue's, read as before) plus the
 * secondaries of osionos_user_emails, and the routes that add, resend, verify and remove a
 * secondary. Primary changes (make-primary) are not routed here: they answer 404.
 *
 * The router owns module setup: the keys check (seal, lookup, and the refusal to share one
 * key between purposes) and the dispatch. The table is in bridge-account-email-rows.mjs, the
 * flows in bridge-account-email-flow.mjs, the budgets in bridge-account-email-send.mjs.
 *
 * Without usable keys, or when the table is missing, every mutating route answers 503
 * `email_unavailable` and the GET lists the primary with `x-emails-secondaries: unavailable`.
 *
 * Caveat: the list is the primary plus the secondaries that open and match their keyed
 * hash; a row that does not is skipped and counted in `x-emails-skipped`, never a 500.
 * `verifiedAt` of the primary is GoTrue's `email_confirmed_at`, null when it states none.
 * Equal keys are compared as raw env strings once at setup: two different strings that
 * decode to the same bytes are not caught.
 */

import { accountError, callerSession, respondWithError } from './bridge-account-sudo.mjs';
import { createOtpClient } from './bridge-account-otp.mjs';
import { limitOrFail, settingsFailure } from './bridge-account-settings.mjs';
import { addEmail, recordOf, removeEmail, resendEmail, verifyEmail } from './bridge-account-email-flow.mjs';
import { LOOKUP_ENV, SEAL_ENV, createEmailRows, keysUsable, openAddress } from './bridge-account-email-rows.mjs';
import { readGotrueUser } from './bridge-gotrue-user.mjs';
import { sendJson } from './bridge-social-core.mjs';

const PATH = /^\/api\/account\/emails(?:\/.*)?$/;
const ROUTE = '/api/account/emails';
const ID_ROUTE = /^\/api\/account\/emails\/([^/]+)(?:\/(code|verify))?$/;
const LIMIT = { limit: 30, windowMs: 60_000 };
const MFA_ENV = 'OSIONOS_MFA_SECRET_KEY';
const ACTIONS = { '': ['DELETE', removeEmail], code: ['POST', resendEmail], verify: ['POST', verifyEmail] };

const text = (value) => (typeof value === 'string' && value !== '' ? value : null);

/** The allowlisted EmailRecord of the payload; nothing else of the GoTrue user is read. */
function primaryRecord(userId, payload) {
	const email = text(payload?.email);
	if (!email) return [];
	const createdAt = text(payload.created_at);
	return [{
		_id: `primary-${userId}`,
		userId,
		email,
		isPrimary: true,
		verifiedAt: text(payload.email_confirmed_at),
		createdAt,
		updatedAt: text(payload.updated_at) ?? createdAt,
		removedAt: null,
	}];
}

async function readPrimary(deps, userId) {
	try {
		return primaryRecord(userId, await readGotrueUser(deps, userId));
	} catch (error) {
		if (error?.upstreamStatus === 404) return [];
		throw settingsFailure('read the account email');
	}
}

/** The pairs of key variables holding the same raw string; keys must not be shared between purposes. */
function sharedKeyNames(env) {
	const names = [SEAL_ENV, LOOKUP_ENV, MFA_ENV];
	const shared = new Set();
	for (const [i, a] of names.entries()) {
		for (const b of names.slice(i + 1)) {
			if (env[a] && env[a] === env[b]) { shared.add(a); shared.add(b); }
		}
	}
	return [...shared];
}

async function listEmails(ctx, session, response) {
	const { userId } = session;
	await limitOrFail(ctx.kv, ['account-emails', userId], LIMIT);
	const list = await readPrimary(ctx, userId);
	let unavailable = !ctx.keysUsable;
	let skipped = 0;
	if (!unavailable) {
		try {
			for (const row of await ctx.rows.list(userId)) {
				const address = openAddress(row, ctx.env);
				if (address) list.push(recordOf(row, address)); else skipped += 1;
			}
		} catch {
			unavailable = true;
		}
	}
	if (unavailable) response.setHeader('x-emails-secondaries', 'unavailable');
	if (skipped > 0) response.setHeader('x-emails-skipped', String(skipped));
	if (unavailable || skipped > 0) response.setHeader('access-control-expose-headers', 'x-emails-secondaries, x-emails-skipped');
	return sendJson(response, 200, list, ctx.config);
}

export function createAccountEmailsRoutes({ config, kv, pg, verifySession, env = process.env, fetchImpl = fetch, now = null, track = () => {}, log = (...parts) => console.error(...parts) }) {
	const shared = sharedKeyNames(env);
	if (shared.length > 0) log('account_emails_keys_shared', shared.join(','));
	const ctx = {
		config, kv, pg, env, fetchImpl, track, log, now: typeof now === 'function' ? now : Date.now,
		keysUsable: shared.length === 0 && keysUsable(env),
		secret: String(env.JWT_SECRET ?? '').trim(),
		rows: createEmailRows({ pg, env }),
		otp: createOtpClient({ fail: accountError, codes: { unavailable: 'email_unavailable', proofInvalid: 'email_proof_invalid', unavailableMessage: 'Email verification is unavailable; try again shortly.' } }),
	};
	return async function handleEmailsRequest(url, request, response) {
		if (!PATH.test(url.pathname)) return false;
		try {
			const session = callerSession(request, config, verifySession);
			const method = (request.method || 'GET').toUpperCase();
			if (url.pathname === ROUTE) {
				if (method === 'GET') return await listEmails(ctx, session, response);
				if (method !== 'POST') throw accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
				return await addEmail(ctx, session, request, response);
			}
			const match = ID_ROUTE.exec(url.pathname);
			const [verb, action] = ACTIONS[match?.[2] ?? ''] ?? [];
			if (!match || verb !== method) throw accountError(404, 'not_found', 'There is no email on that path.');
			return await action(ctx, session, request, response, decodeURIComponent(match[1]));
		} catch (error) {
			respondWithError(response, error, config);
		}
		return true;
	};
}
