/**
 * "@AI" answers in a text channel (C429). The AI service drafts privately for
 * the member who asked (POST /api/ai/thread-runs); only that member's click
 * posts it, here, as a message of the AI bot. The bridge copies the run's ONE
 * stored answer (ai_runs.answer_message_id), never text from the client, and
 * only for a run bound to this channel whose trigger has not changed since.
 *
 * Route (only with OSIONOS_THREAD_ANSWERS=on; otherwise the chat 404):
 *   POST /api/chat/channels/:id/ai-answers   {runId}
 *
 * A posted answer is shown as "AI" from its ai_run_id, never from a username
 * (C435, C436). It resolves no mention and notifies nobody (C438). Its
 * requester and the channel's owner/admin may delete it; nobody may edit it
 * (C437). The schema is groot models/osionos-ai-thread-answers-migration.sql.
 */

import {
	httpError,
	identitySummaries,
	isUniqueViolation,
	publishRealtime,
	readJsonBody,
	requireUuid,
	rest,
	safeText,
	sendJson,
} from './bridge-social-core.mjs';
import { decideWrite } from './bridge-moderation-gate.mjs';
import { takeToken } from './bridge-ratelimit.mjs';

/** The bot's author id: the literal osionos_ai_bot_author() returns. */
export const AI_BOT_AUTHOR = 'a1000000-0000-4000-8000-0000000000a1';
/** How a posted answer is shown. */
export const AI_IDENTITY = Object.freeze({ name: 'AI', avatar: null });
/** Handles that are the AI's, never a person's: reserved usernames (C435, C438). */
export const AI_HANDLES = new Set(['ai', 'ai-bot', 'assistant']);
/** An answer older than this is not posted: the thread has moved on (C431). */
const ANSWER_MAX_AGE_MS = 30 * 60_000;
const CHAT_CONTENT_LIMIT = 8000;

export function threadAnswersEnabled(env) {
	return env?.OSIONOS_THREAD_ANSWERS === 'on';
}

export function isAiAnswer(row) {
	return Boolean(row?.ai_run_id);
}

/** The author a message row is shown with: the AI for a posted answer (C436). */
export function authorSummary(row, identities) {
	return isAiAnswer(row) ? AI_IDENTITY : identities.get(row?.author_id);
}

function refusal(status, code, message) {
	return Object.assign(httpError(message, status), { code });
}

async function readRun(config, fetchImpl, runId) {
	const rows = await rest(config, fetchImpl,
		`ai_runs?id=eq.${runId}&select=owner_id,status,finish_reason,created_at,ended_at,surface,surface_ref,answer_message_id&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** The text of the run's one assistant message (C432). */
async function answerText(config, fetchImpl, runId, messageId) {
	if (!messageId) return '';
	const rows = await rest(config, fetchImpl,
		`ai_messages?id=eq.${messageId}&run_id=eq.${runId}&role=eq.assistant&select=parts&limit=1`);
	const parts = Array.isArray(rows) ? rows[0]?.parts : null;
	const text = Array.isArray(parts) ? parts.find((part) => part?.type === 'text')?.text : '';
	return safeText(text, CHAT_CONTENT_LIMIT);
}

/**
 * Why the run cannot be posted to this channel by this caller, or null:
 * someone else's run, an ordinary run, another channel's (C430), or one that
 * did not end well and recently (C431).
 */
function runRefusal(run, userId, channelId, now) {
	if (!run || run.owner_id !== userId || run.surface !== 'channel' || run.surface_ref?.channelId !== channelId) {
		return refusal(404, 'not_found', 'Answer not found.');
	}
	if (run.status !== 'succeeded' || (run.finish_reason != null && run.finish_reason !== 'stop')) {
		return refusal(409, 'answer_not_ready', 'This answer did not finish.');
	}
	if (!run.ended_at || now - Date.parse(run.ended_at) > ANSWER_MAX_AGE_MS) {
		return refusal(409, 'answer_stale', 'This answer is too old to post. Ask again.');
	}
	return null;
}

/** The trigger as it is now: still the caller's, live, and not edited after the run (C443). */
async function readLiveTrigger(config, fetchImpl, run, channelId, userId) {
	const rows = await rest(config, fetchImpl,
		`osionos_messages?id=eq.${run.surface_ref.messageId}&channel_id=eq.${channelId}&select=id,author_id,deleted_at,edited_at,thread_root_id&limit=1`);
	const trigger = Array.isArray(rows) ? rows[0] ?? null : null;
	const editedAfter = trigger?.edited_at && Date.parse(trigger.edited_at) > Date.parse(run.created_at);
	if (!trigger || trigger.deleted_at || trigger.author_id !== userId || editedAfter) {
		throw refusal(409, 'trigger_changed', 'The message you asked about changed. Ask again.');
	}
	return trigger;
}

async function insertAnswer(config, fetchImpl, body) {
	try {
		const rows = await rest(config, fetchImpl, 'osionos_messages', { method: 'POST', body, prefer: 'return=representation' });
		const row = Array.isArray(rows) ? rows[0] : rows;
		if (!row) throw httpError('Message persistence failed.', 502);
		return row;
	} catch (error) {
		// osionos_messages_ai_run_id_key: a run is posted once (C445).
		if (isUniqueViolation(error)) throw refusal(409, 'already_posted', 'This answer is already posted.');
		throw error;
	}
}

/** POST /api/chat/channels/:id/ai-answers — the asker posts their run's answer. */
export async function postAiAnswer(deps, session, request, channelId, response, config, chat) {
	const payload = await readJsonBody(request, 4 * 1024);
	const runId = requireUuid(payload.runId, 'runId');
	const { channel } = await chat.requireChannelAccess(config, deps.fetchImpl, session.userId, channelId);
	// A dm, voice or video channel never carries an answer (C452).
	if (channel.kind !== 'text') throw refusal(404, 'not_found', 'Answer not found.');
	takeToken(`msg:${session.userId}`, { capacity: 20, refillPerSec: 5 });
	const run = await readRun(config, deps.fetchImpl, runId);
	const refused = runRefusal(run, session.userId, channel.id, Date.now());
	if (refused) throw refused;
	const content = await answerText(config, deps.fetchImpl, runId, run.answer_message_id);
	if (!content) throw refusal(409, 'answer_not_ready', 'This answer did not finish.');
	const trigger = await readLiveTrigger(config, deps.fetchImpl, run, channel.id, session.userId);
	// The rules apply in full whatever the deployment's mode, with no "post
	// anyway": the asker did not write these words (C444).
	if (decideWrite({ text: content, surface: 'channel', mode: 'on', acknowledged: false }).outcome !== 'write') {
		throw refusal(409, 'answer_blocked', 'This answer breaks the channel rules and cannot be posted.');
	}
	const row = await insertAnswer(config, deps.fetchImpl, {
		channel_id: channel.id,
		author_id: AI_BOT_AUTHOR,
		content,
		attachments: [],
		reply_to_id: trigger.id,
		thread_root_id: trigger.thread_root_id ?? trigger.id,
		ai_requested_by: session.userId,
		ai_run_id: runId,
	});
	const asker = (await identitySummaries(config, deps.fetchImpl, [session.userId])).get(session.userId);
	const aiRequestedBy = { id: session.userId, name: asker?.name ?? 'Member' };
	await publishRealtime({
		topic: chat.chatTopic(channel),
		eventType: 'message_created',
		payload: {
			messageId: row.id, channelId: channel.id, authorId: AI_BOT_AUTHOR,
			authorName: AI_IDENTITY.name, authorAvatar: null, content: row.content, createdAt: row.created_at,
			attachments: [], replyTo: null, mentions: [], threadRootId: row.thread_root_id, isAi: true, aiRequestedBy,
		},
		fetchImpl: deps.fetchImpl,
		env: deps.env,
	});
	return sendJson(response, 201, { ok: true, message: chat.messageEntry(row, AI_IDENTITY) }, config);
}
