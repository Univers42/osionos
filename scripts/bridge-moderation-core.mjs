/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-moderation-core.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Interaction limits: who may message, connect with or comment on a person, and until
 * when. The limits live in the `moderation` section of `osionos_user_settings`; this module
 * is the vocabulary (modes, durations), the pure half (validate a patch, read a stored
 * value) and the decision the three enforcement points share (chat, social, comments).
 *
 * The vocabulary is declared here once; the app keeps a copy in `moderationModel.ts` and a
 * canvas test compares the two.
 *
 * Caveat: a failed read of the target's limit lets the interaction through (a database
 * hiccup that refused every DM on the platform is the worse failure), so one interaction
 * the limit would have refused reaches the person during the outage; the failure is a
 * `console.warn`, never read as "no limit". A failed read of a BLOCK is the opposite:
 * it refuses with 503 (`assertNotBlocked`).
 * Caveat: the limit is read on every interaction without a cache, so expiry is exact but
 * each DM, request and comment costs one extra read of the target's row.
 */

import { httpError, requireUuid, rest, workspaceMembership } from './bridge-social-core.mjs';

export const MODERATION_SECTION = 'moderation';
export const INTERACTIONS = ['messages', 'connections', 'comments'];
export const MODES = {
	messages: ['everyone', 'connections', 'nobody'],
	connections: ['everyone', 'nobody'],
	comments: ['everyone', 'workspace', 'nobody'],
};
export const DURATION_HOURS = [24, 168, 720, 2160, 4320];

const HOUR_MS = 3_600_000;
const REFUSAL_MESSAGES = {
	messages: 'This person is not accepting messages from you.',
	connections: 'This person is not accepting connection requests from you.',
	comments: 'This person is not accepting comments on their pages.',
};

function moderationError(status, code, message) {
	return Object.assign(httpError(message, status), { code });
}

function isPlainObject(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function entryFor(interaction, request, now) {
	const mode = isPlainObject(request) ? request.mode : undefined;
	if (!MODES[interaction].includes(mode)) {
		throw moderationError(422, 'invalid_mode', `The mode for ${interaction} must be one of ${MODES[interaction].join(', ')}.`);
	}
	if (mode === 'everyone') return { mode };
	if (!DURATION_HOURS.includes(request.durationHours)) {
		throw moderationError(422, 'invalid_duration', `durationHours must be one of ${DURATION_HOURS.join(', ')}.`);
	}
	return { mode, until: new Date(now + request.durationHours * HOUR_MS).toISOString() };
}

/**
 * The patch to store for a client body: each interaction's mode and a duration in hours
 * become `{ mode, until }` on the bridge's clock. Anything else the client sends (an
 * `until` of its own) is dropped, not trusted.
 */
export function normaliseModerationPatch(patch, now = Date.now()) {
	if (!isPlainObject(patch)) throw moderationError(422, 'invalid_body', 'The moderation body must be a JSON object.');
	const stored = {};
	for (const [interaction, request] of Object.entries(patch)) {
		if (!INTERACTIONS.includes(interaction)) throw moderationError(422, 'unknown_interaction', `${interaction} is not an interaction that can be limited.`);
		stored[interaction] = entryFor(interaction, request, now);
	}
	return stored;
}

function liveEntry(interaction, stored, now) {
	const entry = isPlainObject(stored) ? stored[interaction] : null;
	if (!isPlainObject(entry) || !MODES[interaction].includes(entry.mode) || entry.mode === 'everyone') return { mode: 'everyone' };
	// A malformed `until` parses to NaN, which compares false: it is expired, not unlimited.
	const until = typeof entry.until === 'string' ? Date.parse(entry.until) : Number.NaN;
	return until > now ? { mode: entry.mode, until: entry.until } : { mode: 'everyone' };
}

/** The effective policy of a stored value: the default (everyone) wherever it is missing, unknown or expired. */
export function moderationPolicy(value, now = Date.now()) {
	return Object.fromEntries(INTERACTIONS.map((interaction) => [interaction, liveEntry(interaction, value, now)]));
}

/** The stored `moderation` value of one user, read as the service role (one section, one column). */
export async function moderationPolicyFor(config, fetchImpl, userId) {
	const id = requireUuid(userId, 'userId');
	const rows = await rest(config, fetchImpl, `osionos_user_settings?user_id=eq.${id}&section=eq.${MODERATION_SECTION}&select=value&limit=1`);
	const value = Array.isArray(rows) ? rows[0]?.value : null;
	return isPlainObject(value) ? value : {};
}

/**
 * Throws 403 `message` when either user blocked the other. A read that fails or answers
 * something that is not a list is a 503, never "not blocked": nothing is written then.
 */
export async function assertNotBlocked(config, fetchImpl, actorId, targetId, message) {
	let rows;
	try {
		rows = await rest(
			config,
			fetchImpl,
			`osionos_user_blocks?or=(and(blocker_id.eq.${actorId},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${actorId}))&select=blocker_id&limit=1`,
		);
	} catch {
		throw moderationError(503, 'block_check_unavailable', 'The block list could not be read; try again.');
	}
	if (!Array.isArray(rows)) throw moderationError(503, 'block_check_unavailable', 'The block list could not be read; try again.');
	if (rows.length > 0) throw httpError(message, 403);
}

async function hasAcceptedConnection(config, fetchImpl, actorId, targetId) {
	const rows = await rest(
		config,
		fetchImpl,
		`osionos_connections?or=(and(requester_id.eq.${actorId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${actorId}))&select=requester_id,addressee_id,status&limit=1`,
	);
	return Array.isArray(rows) && rows.some((row) => row?.status === 'accepted');
}

async function modeAllows(config, fetchImpl, mode, { actorId, targetId, workspaceId }) {
	if (mode === 'connections') return hasAcceptedConnection(config, fetchImpl, actorId, targetId);
	if (mode === 'workspace') return Boolean(workspaceId) && Boolean(await workspaceMembership(config, fetchImpl, actorId, workspaceId));
	return false;
}

/** null when the interaction is allowed, else the 403 refusal; it says one thing and never the mode or the expiry. */
export async function interactionRefusal(config, fetchImpl, { interaction, actorId, targetId, workspaceId }, now = Date.now()) {
	if (actorId === targetId) return null;
	let stored;
	try {
		stored = await moderationPolicyFor(config, fetchImpl, targetId);
	} catch (error) {
		console.warn(`[osionos-bridge] moderation policy read failed (status ${error?.status ?? 'unknown'}); the ${interaction} interaction was allowed`);
		return null;
	}
	const { mode } = moderationPolicy(stored, now)[interaction];
	if (mode === 'everyone') return null;
	if (await modeAllows(config, fetchImpl, mode, { actorId, targetId, workspaceId })) return null;
	return { status: 403, code: 'interaction_not_allowed', message: REFUSAL_MESSAGES[interaction] };
}

/** interactionRefusal as a throw, so a handler's own catch answers it. */
export async function requireInteraction(config, fetchImpl, args) {
	const refusal = await interactionRefusal(config, fetchImpl, args);
	if (refusal) throw moderationError(refusal.status, refusal.code, refusal.message);
}
