/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-status.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */



/**
 * PATCH /api/account/profile/status — the owner sets or clears their status.
 *
 * The write goes through `pg.asUser(session)`, so the account role's row-level security
 * (`user_id = osionos_account_uid()`) is what keeps it to the caller's own row; the filter
 * here is the second lock. The answer is the status after the write, with the row's new
 * version as the ETag.
 */

import { rateLimit } from './bridge-guard.mjs';
import { callerSession, accountError, readProfileBody, respondWithError } from './bridge-account-profile.mjs';
import { STATUS_COLUMNS, parseStatusUpdate } from './bridge-status.mjs';
import { sendJson } from './bridge-social-core.mjs';

const STATUS_PATH = '/api/account/profile/status';
const STATUS_LIMIT = 30;
const STATUS_WINDOW_MS = 60_000;

async function patchStatus({ pg, kv, now }, session, request, response, config) {
	await rateLimit(kv, ['profile-status', session.userId], { limit: STATUS_LIMIT, windowMs: STATUS_WINDOW_MS });
	const update = parseStatusUpdate(await readProfileBody(request), now());
	const params = new URLSearchParams({ user_id: `eq.${session.userId}`, select: [...STATUS_COLUMNS, 'version'].join(',') });
	const rows = await pg.asUser(session).patch(`osionos_profiles?${params}`, update, { prefer: 'return=representation' });
	if (!Array.isArray(rows) || rows.length === 0) throw accountError(404, 'profile_missing', 'This account has no profile row yet.');
	const row = rows[0];
	response.setHeader('ETag', `"${Number(row.version ?? 0)}"`);
	return sendJson(response, 200, {
		emoji: row.status_emoji ?? null,
		text: row.status_text ?? null,
		expiresAt: row.status_expires_at ?? null,
		busy: row.status_busy === true,
	}, config);
}

export function createAccountStatusRoutes({ config, pg, kv, verifySession, now = null }) {
	const clock = now ?? Date.now;
	return async function handleAccountStatus(url, request, response) {
		if (url.pathname !== STATUS_PATH) return false;
		try {
			const session = callerSession(request, config, verifySession);
			const method = (request.method || 'GET').toUpperCase();
			if (method !== 'PATCH') throw accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
			return await patchStatus({ pg, kv, now: clock }, session, request, response, config);
		} catch (error) {
			return respondWithError(response, error, config);
		}
	};
}
