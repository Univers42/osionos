/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-status.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */



/**
 * The user-set status (emoji, text, expiry, busy) of an osionos profile: the validation of a
 * write and the projection of a row into what a viewer sees.
 *
 * Expiry is lazy: nothing clears an expired row. Every read goes through `statusOf`, which
 * answers no status once `status_expires_at` has passed, and the next write overwrites it.
 *
 * Caveat: the row keeps an expired status until the owner writes again, so a direct
 * database reader (a report, an export) must apply the same rule or it shows a stale one.
 */

import { rest } from './bridge-social-core.mjs';

export const STATUS_COLUMNS = ['status_emoji', 'status_text', 'status_expires_at', 'status_busy'];
const EMOJI_LIMIT = 8;
const TEXT_LIMIT = 120;
const FIELDS = new Set(['emoji', 'text', 'expiresAt', 'busy']);
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const statusError = (code, message) => Object.assign(new Error(message), { status: 422, code });
const isClear = (value) => value === null || value === '';

/** The status of a profile row as a viewer sees it, or null when none is set or it has expired. */
export function statusOf(row, nowMs = Date.now()) {
	const expiresAt = row?.status_expires_at ?? null;
	if (expiresAt !== null && Date.parse(expiresAt) <= nowMs) return null;
	const emoji = row?.status_emoji ?? null;
	const text = row?.status_text ?? null;
	const busy = row?.status_busy === true;
	if (emoji === null && text === null && !busy) return null;
	return { emoji, text, expiresAt, busy };
}

function textField(value, limit, code, label) {
	if (isClear(value)) return null;
	const clean = typeof value === 'string' ? value.replace(CONTROL_CHARACTERS, '').trim() : null;
	if (clean === null || Array.from(clean).length > limit) throw statusError(code, `${label} must be text of at most ${limit} characters.`);
	return clean || null;
}

function expiryField(value, nowMs) {
	if (isClear(value)) return null;
	const at = typeof value === 'string' ? Date.parse(value) : Number.NaN;
	if (!Number.isFinite(at) || at <= nowMs) throw statusError('invalid_expires_at', 'expiresAt must be an ISO date in the future, or null.');
	return new Date(at).toISOString();
}

/**
 * The columns a status PATCH writes. A key the body does not carry is left alone, except
 * the expiry: a new emoji or text without one starts a status that does not expire, so
 * the previous status's deadline can never cut the new one short.
 */
export function parseStatusUpdate(payload, nowMs = Date.now()) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw statusError('invalid_body', 'The status update must be a JSON object.');
	const unknown = Object.keys(payload).find((key) => !FIELDS.has(key));
	if (unknown) throw statusError('unknown_field', `The field "${unknown}" is not part of the status.`);
	const update = {};
	if (Object.hasOwn(payload, 'emoji')) update.status_emoji = textField(payload.emoji, EMOJI_LIMIT, 'invalid_emoji', 'emoji');
	if (Object.hasOwn(payload, 'text')) update.status_text = textField(payload.text, TEXT_LIMIT, 'invalid_text', 'text');
	if (Object.hasOwn(payload, 'busy')) {
		if (typeof payload.busy !== 'boolean') throw statusError('invalid_busy', 'busy must be true or false.');
		update.status_busy = payload.busy;
	}
	if (Object.hasOwn(payload, 'expiresAt')) update.status_expires_at = expiryField(payload.expiresAt, nowMs);
	else if ('status_emoji' in update || 'status_text' in update) update.status_expires_at = null;
	if (Object.keys(update).length === 0) throw statusError('empty_update', 'The status update names no field.');
	return update;
}

/**
 * The status of `userId` for the legacy profile card, read with the service role.
 * Caveat: a failed read answers no status instead of failing the card, so an outage of
 * the profile table hides statuses rather than the whole profile.
 */
export async function readStatus(config, fetchImpl, userId, nowMs = Date.now()) {
	try {
		const rows = await rest(config, fetchImpl, `osionos_profiles?user_id=eq.${userId}&select=${STATUS_COLUMNS.join(',')}&limit=1`);
		return statusOf(Array.isArray(rows) ? rows[0] : null, nowMs);
	} catch {
		return null;
	}
}
