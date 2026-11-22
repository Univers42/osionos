/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-chat-autopost.mjs                             :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * osio auto-post, bridge half (osio-bot ruling OB2, OB11, OB12). In a text
 * channel whose admin opted in, the asker's client posts a ready @ai answer
 * through the unchanged POST /api/chat/channels/:id/ai-answers (OB1); the
 * bridge only stores and reports the opt-in and relays a textless "osio is
 * answering" typing event.
 *
 * ai_autopost is a consent knob, not a security boundary: every guard of
 * postAiAnswer (own run, unedited trigger, unchanged context, L0 moderation,
 * one post per run) still decides what reaches the channel.
 */

import { httpError, readJsonBody, rest, sendJson } from './bridge-social-core.mjs';

/** OB11: the opt-in exists only with both bridge flags exactly "on" (C450). */
export function autopostEnabled(env) {
	return env?.OSIONOS_THREAD_ANSWERS === 'on' && env?.OSIONOS_AI_AUTOPOST === 'on';
}

/** A database without the column has no ai_autopost key: that reads as off. */
export function channelAutopost(row) {
	return row?.kind === 'text' && row.ai_autopost === true;
}

/** The listed channel gains aiAutopost only with the flag on, so the shape is unchanged off. */
export function withAutopost(entry, row, env) {
	return autopostEnabled(env) ? { ...entry, aiAutopost: channelAutopost(row) } : entry;
}

function coded(message, status, code) {
	return Object.assign(httpError(message, status), { code });
}

/** PostgREST answers a write to an unknown column with PGRST204 (42703 on older builds); rest() makes it a 502. */
function isMissingColumn(error) {
	const message = error instanceof Error ? error.message : '';
	return error?.status === 502 && message.includes('ai_autopost') && /PGRST204|42703/.test(message);
}

async function writeAutopost(deps, config, channelId, enabled) {
	try {
		const rows = await rest(config, deps.fetchImpl, `osionos_channels?id=eq.${channelId}`, {
			method: 'PATCH', body: { ai_autopost: enabled }, prefer: 'return=representation',
		});
		return Array.isArray(rows) ? rows[0] : rows;
	} catch (error) {
		if (isMissingColumn(error)) throw coded('Auto-posting is not available on this server yet.', 503, 'autopost_unavailable');
		throw error;
	}
}

/** PUT /api/chat/channels/:id/ai-autopost {enabled} — a channel owner or admin only (OB2). */
export async function setChannelAutopost(deps, session, request, channelId, response, config, chat) {
	const { channel } = await chat.requireChannelAdmin(config, deps.fetchImpl, session.userId, channelId);
	const payload = await readJsonBody(request);
	if (typeof payload.enabled !== 'boolean') throw httpError('enabled must be true or false.', 422);
	if (channel.kind !== 'text') throw coded('Only a text channel can auto-post answers.', 422, 'autopost_text_only');
	const row = (await writeAutopost(deps, config, channelId, payload.enabled)) ?? { ...channel, ai_autopost: payload.enabled };
	return sendJson(response, 200, { ok: true, channel: withAutopost(chat.channelEntry(row, null, config), row, deps.env) }, config);
}

/**
 * OB12: in an opted-in channel the asker's client announces that osio is
 * answering. The event carries no text and no userId, so an older client,
 * which shows a typer by userId, ignores it rather than naming the asker.
 */
export async function typingPayload(request, channel, userId, env) {
	const body = request ? await readJsonBody(request).catch(() => ({})) : {};
	if (body?.ai === true && autopostEnabled(env) && channelAutopost(channel)) return { channelId: channel.id, ai: true };
	return { channelId: channel.id, userId };
}
