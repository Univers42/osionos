/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-agent.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * In-chat AI agent for the osionos bridge — POST /api/agent/chat.
 *
 * Streams a Claude response (with tool use) as SSE in the EXACT event shape the
 * frontend already parses (src/shared/agent/useAgentStream.ts +
 * widgets/agent-conversation): `meta`, `delta` {text}, `tool` {id,name,input},
 * `tool_result` {toolUseId,text}, `result` {text}, `error` {message}.
 *
 * Dependency-free like the other bridge-*.mjs (Node built-ins only): the
 * Anthropic Messages API is called with the built-in `fetch` (no
 * @anthropic-ai/sdk), and tools run bridge-native via rest() rather than an MCP
 * stdio server. Tools are scoped to the caller's own workspaces.
 *
 * Graceful by design: a missing ANTHROPIC_API_KEY responds 200 SSE with one
 * `error` frame then ends, and any upstream failure becomes an `error` event —
 * the bridge never 500s or crashes on this route.
 */

import {
	UUID_REGEX,
	bearerToken,
	httpError,
	readJsonBody,
	rest,
	safeText,
} from './bridge-social-core.mjs';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;
const MAX_TOOL_ITERATIONS = 6;
const UPSTREAM_TIMEOUT_MS = 60_000;
const AGENT_BODY_LIMIT = 256 * 1024;
const MAX_RESULT_TEXT = 60_000;

const SYSTEM_PROMPT = [
	'You are the osionos assistant, embedded in a Notion-style collaborative workspace.',
	'Answer conversational questions directly and concisely.',
	'When the user asks about their pages or workspaces, use the provided tools — they are',
	'scoped to the workspaces this user can access. Summarize what you did after using a tool.',
	'Page content is an array of blocks; each block is { type, content, ... }. Keep replies suitable for a chat transcript.',
].join(' ');

/** Anthropic tool definitions (JSON schema) advertised to the model. */
const TOOL_DEFINITIONS = [
	{
		name: 'list_workspaces',
		description: 'List the workspaces the current user can access. Use this first to discover workspace ids.',
		input_schema: { type: 'object', properties: {}, additionalProperties: false },
	},
	{
		name: 'search_pages',
		description: 'Search the current user\'s pages by title/content text across their accessible workspaces.',
		input_schema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Case-insensitive text to match in page titles or content.' },
			},
			required: ['query'],
			additionalProperties: false,
		},
	},
	{
		name: 'get_page',
		description: 'Read a single page (title + block content) by its page id. The page must belong to one of the user\'s workspaces.',
		input_schema: {
			type: 'object',
			properties: {
				pageId: { type: 'string', description: 'UUID of the page to read.' },
			},
			required: ['pageId'],
			additionalProperties: false,
		},
	},
	{
		name: 'create_page',
		description: 'Create a new page in one of the user\'s workspaces. Optionally seed it with markdown converted to paragraph blocks.',
		input_schema: {
			type: 'object',
			properties: {
				workspaceId: { type: 'string', description: 'UUID of the target workspace (must be one the user can access).' },
				title: { type: 'string', description: 'Page title.' },
				markdown: { type: 'string', description: 'Optional plain text / markdown; each non-empty line becomes a paragraph block.' },
			},
			required: ['workspaceId', 'title'],
			additionalProperties: false,
		},
	},
];

function clampText(value) {
	return String(value ?? '').slice(0, MAX_RESULT_TEXT);
}

/** Workspace ids the caller can touch: the token's workspace_ids ∪ members rows. */
async function callerWorkspaceIds(deps, session) {
	const ids = new Set((session.workspaceIds ?? []).filter((id) => UUID_REGEX.test(String(id))));
	try {
		const rows = await rest(deps.config, deps.fetchImpl, `osionos_workspace_members?user_id=eq.${session.userId}&select=workspace_id`);
		for (const row of Array.isArray(rows) ? rows : []) {
			if (UUID_REGEX.test(String(row.workspace_id))) ids.add(row.workspace_id);
		}
	} catch {
		// Best-effort — the token's own workspace_ids are still authoritative.
	}
	return [...ids];
}

function pageRowToSummary(row) {
	return {
		id: row.id,
		title: typeof row.title === 'string' && row.title ? row.title : 'Untitled',
		workspaceId: row.workspace_id,
		updatedAt: row.updated_at ?? row.created_at ?? null,
	};
}

function blockText(block) {
	if (!block || typeof block !== 'object') return '';
	return String(block.content ?? '');
}

function markdownToBlocks(markdown) {
	const text = safeText(markdown, 20_000);
	if (!text) return [];
	return text
		.split(/\r?\n/)
		.filter((line) => line.trim())
		.map((line) => ({ type: 'paragraph', content: line.trim() }));
}

/* ----------------------------- tool execution ----------------------------- */

async function toolListWorkspaces(deps, session) {
	const ids = await callerWorkspaceIds(deps, session);
	if (ids.length === 0) return { workspaces: [] };
	const rows = await rest(deps.config, deps.fetchImpl, `osionos_workspaces?id=in.(${ids.join(',')})&select=id,name,slug`);
	const workspaces = (Array.isArray(rows) ? rows : []).map((row) => ({
		id: row.id,
		name: typeof row.name === 'string' && row.name ? row.name : 'osionos workspace',
		slug: row.slug ?? null,
	}));
	return { workspaces };
}

async function toolSearchPages(deps, session, input) {
	const query = safeText(input?.query, 200).toLowerCase();
	if (!query) throw httpError('query is required.', 422);
	const ids = await callerWorkspaceIds(deps, session);
	if (ids.length === 0) return { query, count: 0, pages: [] };
	const rows = await rest(
		deps.config,
		deps.fetchImpl,
		`osionos_pages?workspace_id=in.(${ids.join(',')})&select=id,title,workspace_id,content,updated_at,created_at,archived_at,owner_id&order=updated_at.desc&limit=200`,
	);
	const matches = [];
	for (const row of Array.isArray(rows) ? rows : []) {
		if (row.archived_at) continue;
		if (row.owner_id != null && row.owner_id !== session.userId) continue; // never leak another user's pages
		let haystack = String(row.title ?? '').toLowerCase();
		try {
			haystack += '\n' + JSON.stringify(row.content ?? '').toLowerCase();
		} catch { /* unserialisable content — title only */ }
		if (haystack.includes(query)) matches.push(pageRowToSummary(row));
		if (matches.length >= 20) break;
	}
	return { query, count: matches.length, pages: matches };
}

async function toolGetPage(deps, session, input) {
	const pageId = safeText(input?.pageId, 80);
	if (!UUID_REGEX.test(pageId)) throw httpError('pageId must be a UUID.', 422);
	const ids = await callerWorkspaceIds(deps, session);
	const rows = await rest(deps.config, deps.fetchImpl, `osionos_pages?id=eq.${pageId}&select=id,title,workspace_id,content,owner_id&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) throw httpError('Page not found.', 404);
	if (!ids.includes(row.workspace_id)) throw httpError('You do not have access to this page.', 403);
	if (row.owner_id != null && row.owner_id !== session.userId) throw httpError('You do not have access to this page.', 403);
	const blocks = Array.isArray(row.content) ? row.content : [];
	return {
		page: {
			id: row.id,
			title: typeof row.title === 'string' && row.title ? row.title : 'Untitled',
			workspaceId: row.workspace_id,
			text: blocks.map(blockText).filter(Boolean).join('\n'),
			blockCount: blocks.length,
		},
	};
}

async function toolCreatePage(deps, session, input) {
	const workspaceId = safeText(input?.workspaceId, 80);
	if (!UUID_REGEX.test(workspaceId)) throw httpError('workspaceId must be a UUID.', 422);
	const ids = await callerWorkspaceIds(deps, session);
	if (!ids.includes(workspaceId)) throw httpError('You do not have access to this workspace.', 403);
	const title = safeText(input?.title, 200) || 'Untitled';
	const rows = await rest(deps.config, deps.fetchImpl, 'osionos_pages', {
		method: 'POST',
		body: {
			workspace_id: workspaceId,
			owner_id: session.userId,
			title,
			visibility: 'private',
			content: markdownToBlocks(input?.markdown),
		},
		prefer: 'return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	if (!row) throw httpError('Page creation returned no row.', 502);
	// The mirror-to-client path in AgentConversationPage parses `created`/`page`.
	return { created: { id: row.id, title: row.title }, page: { _id: row.id, title: row.title, content: row.content ?? [] } };
}

const TOOL_RUNNERS = {
	list_workspaces: (deps, session) => toolListWorkspaces(deps, session),
	search_pages: (deps, session, input) => toolSearchPages(deps, session, input),
	get_page: (deps, session, input) => toolGetPage(deps, session, input),
	create_page: (deps, session, input) => toolCreatePage(deps, session, input),
};

async function executeTool(deps, session, name, input) {
	const runner = TOOL_RUNNERS[name];
	if (!runner) return { ok: false, error: `Unknown tool: ${name}` };
	try {
		return await runner(deps, session, input ?? {});
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : 'Tool execution failed.' };
	}
}

/* ------------------------------ SSE plumbing ------------------------------ */

function sse(response, event, data) {
	response.write(`event: ${event}\n`);
	response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSseHead(response, config) {
	response.writeHead(200, {
		'content-type': 'text/event-stream; charset=utf-8',
		'cache-control': 'no-store',
		connection: 'keep-alive',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
}

/* -------------------------- Anthropic message turn ------------------------- */

/** Normalize {messages?|prompt} into Anthropic message turns. */
function buildMessages(payload) {
	if (Array.isArray(payload?.messages) && payload.messages.length > 0) {
		const turns = [];
		for (const message of payload.messages) {
			const role = message?.role === 'assistant' ? 'assistant' : 'user';
			const text = safeText(message?.content ?? message?.body ?? message?.text, 8000);
			if (text) turns.push({ role, content: text });
		}
		if (turns.length > 0) return turns;
	}
	const prompt = safeText(payload?.prompt, 8000);
	if (!prompt) throw httpError('A prompt or messages array is required.', 422);
	return [{ role: 'user', content: prompt }];
}

async function callAnthropic(deps, model, messages) {
	const response = await deps.fetchImpl(ANTHROPIC_URL, {
		method: 'POST',
		headers: {
			'x-api-key': deps.env.ANTHROPIC_API_KEY,
			'anthropic-version': ANTHROPIC_VERSION,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			model,
			max_tokens: MAX_TOKENS,
			stream: true,
			system: SYSTEM_PROMPT,
			messages,
			tools: TOOL_DEFINITIONS,
		}),
		signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
	});
	if (!response.ok || !response.body) {
		const text = await response.text().catch(() => '');
		throw httpError(`Anthropic request failed with ${response.status}: ${text.slice(0, 200)}`, 502);
	}
	return response;
}

/**
 * Consume one Anthropic SSE stream, translating to the CLIENT contract.
 * Emits `delta` for text and starts/accumulates tool_use blocks. Returns
 * { stopReason, text, toolUses:[{id,name,input}], assistantContent } so the
 * caller can run tools and loop.
 */
async function consumeAnthropicStream(upstream, response) {
	const reader = upstream.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	const blocks = new Map(); // index → { type, text, name, id, json }
	let stopReason = null;

	function handleEvent(json) {
		let event;
		try {
			event = JSON.parse(json);
		} catch {
			return;
		}
		if (event.type === 'content_block_start') {
			const block = event.content_block ?? {};
			blocks.set(event.index, block.type === 'tool_use'
				? { type: 'tool_use', id: block.id, name: block.name, json: '' }
				: { type: 'text', text: '' });
		} else if (event.type === 'content_block_delta') {
			const block = blocks.get(event.index);
			if (!block) return;
			if (event.delta?.type === 'text_delta') {
				block.text += event.delta.text ?? '';
				if (event.delta.text) sse(response, 'delta', { text: event.delta.text });
			} else if (event.delta?.type === 'input_json_delta') {
				block.json += event.delta.partial_json ?? '';
			}
		} else if (event.type === 'message_delta') {
			if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
		}
	}

	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let boundary = buffer.indexOf('\n\n');
		while (boundary >= 0) {
			const frame = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
			if (dataLine) handleEvent(dataLine.slice(5).trim());
			boundary = buffer.indexOf('\n\n');
		}
	}

	let text = '';
	const toolUses = [];
	const assistantContent = [];
	for (const block of [...blocks.values()]) {
		if (block.type === 'text') {
			text += block.text;
			if (block.text) assistantContent.push({ type: 'text', text: block.text });
		} else if (block.type === 'tool_use') {
			let input = {};
			try {
				input = block.json ? JSON.parse(block.json) : {};
			} catch { /* malformed tool input → empty object */ }
			toolUses.push({ id: block.id, name: block.name, input });
			assistantContent.push({ type: 'tool_use', id: block.id, name: block.name, input });
		}
	}
	return { stopReason, text, toolUses, assistantContent };
}

/* ------------------------------- dispatcher ------------------------------- */

async function streamAgent(deps, session, payload, response, config) {
	writeSseHead(response, config);
	const model = safeText(payload?.model, 60) || deps.env.OSIONOS_AGENT_MODEL || DEFAULT_MODEL;
	sse(response, 'meta', { model });

	let messages;
	try {
		messages = buildMessages(payload);
	} catch (error) {
		sse(response, 'error', { message: error instanceof Error ? error.message : 'Invalid request.' });
		sse(response, 'result', { text: '' });
		response.end();
		return true;
	}

	let finalText = '';
	try {
		for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
			const upstream = await callAnthropic(deps, model, messages);
			const turn = await consumeAnthropicStream(upstream, response);
			finalText = turn.text || finalText;

			if (turn.stopReason !== 'tool_use' || turn.toolUses.length === 0) break;

			messages.push({ role: 'assistant', content: turn.assistantContent });
			const toolResults = [];
			for (const toolUse of turn.toolUses) {
				sse(response, 'tool', { id: toolUse.id, name: toolUse.name, input: toolUse.input });
				const result = await executeTool(deps, session, toolUse.name, toolUse.input);
				const resultText = clampText(JSON.stringify(result));
				sse(response, 'tool_result', { toolUseId: toolUse.id, name: toolUse.name, text: resultText });
				toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: resultText });
			}
			messages.push({ role: 'user', content: toolResults });
		}
		sse(response, 'result', { text: finalText });
	} catch (error) {
		sse(response, 'error', { message: error instanceof Error ? error.message : 'Agent stream failed.' });
		sse(response, 'result', { text: finalText });
	}
	response.end();
	return true;
}

/**
 * Build the POST /api/agent/chat dispatcher: `await handler(url, request,
 * response, requestConfig)` → true when handled, false otherwise. deps:
 * { config, verifySession, fetchImpl?, env? }.
 */
export function createAgentHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { config, fetchImpl, env };
	return async function handleAgentRoute(url, request, response, requestConfig = config) {
		if (url.pathname !== '/api/agent/chat') return false;
		if ((request.method || 'GET').toUpperCase() !== 'POST') return false;
		// Auth first — a missing/invalid bearer is a plain 401 JSON, not an SSE stream.
		let session;
		try {
			session = verifySession(bearerToken(request), requestConfig);
		} catch (error) {
			const status = error?.status ?? 401;
			response.writeHead(status, {
				'content-type': 'application/json; charset=utf-8',
				'cache-control': 'no-store',
				'access-control-allow-origin': requestConfig.allowedOrigin,
				'access-control-allow-credentials': 'true',
				vary: 'Origin',
			});
			response.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : 'Authentication required.' }));
			return true;
		}

		let payload;
		try {
			payload = await readJsonBody(request, AGENT_BODY_LIMIT);
		} catch (error) {
			const status = error?.status ?? 400;
			response.writeHead(status, {
				'content-type': 'application/json; charset=utf-8',
				'cache-control': 'no-store',
				'access-control-allow-origin': requestConfig.allowedOrigin,
				'access-control-allow-credentials': 'true',
				vary: 'Origin',
			});
			response.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : 'Invalid request body.' }));
			return true;
		}

		const requestDeps = { ...deps, config: requestConfig };

		// Graceful when the key is unset — 200 SSE with a single error + result.
		if (!env.ANTHROPIC_API_KEY) {
			writeSseHead(response, requestConfig);
			sse(response, 'meta', { model: safeText(payload?.model, 60) || env.OSIONOS_AGENT_MODEL || DEFAULT_MODEL });
			sse(response, 'error', { message: 'AI is not configured (ANTHROPIC_API_KEY missing)' });
			sse(response, 'result', { text: '' });
			response.end();
			return true;
		}

		request.on('close', () => {
			if (!response.writableEnded) response.end();
		});
		return streamAgent(requestDeps, session, payload, response, requestConfig);
	};
}
