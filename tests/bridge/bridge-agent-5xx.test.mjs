/**
 * The agent route writes its own answers and SSE frames, around writeJsonResponse: a 5xx or a
 * caught upstream error reaches the client as the fixed sentence, never the upstream text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAgentHandler } from '../../scripts/bridge-agent.mjs';
import { fixedMessage } from '../../scripts/bridge-error-sentences.mjs';

const LEAK = 'relation osionos_pages_shadow does not exist';
const WS = 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0';
const PAGE = 'c0c0c0c0-1111-4111-8111-c0c0c0c0c0c0';
const CONFIG = { allowedOrigin: 'http://app', baasUrl: 'http://baas', serviceKey: 'k' };
const URL_CHAT = new URL('http://bridge/api/agent/chat');

function fakeRequest() {
	return Object.assign(Readable.from([JSON.stringify({ prompt: 'hi' })]), {
		method: 'POST', headers: { authorization: 'Bearer t' },
	});
}

function fakeResponse() {
	const out = { status: 0, text: '', writableEnded: false };
	out.writeHead = (status) => { out.status = status; };
	out.write = (chunk) => { out.text += String(chunk); return true; };
	out.end = (chunk) => { if (chunk) out.text += String(chunk); out.writableEnded = true; };
	return out;
}

const sseBody = (events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
const toolUseTurn = sseBody([
	{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'get_page' } },
	{ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ pageId: PAGE }) } },
	{ type: 'message_delta', delta: { stop_reason: 'tool_use' } },
]);
const textTurn = sseBody([{ type: 'message_delta', delta: { stop_reason: 'end_turn' } }]);

async function runAgent(fetchImpl, verifySession = () => ({ userId: 'u1' })) {
	const handler = createAgentHandler({ config: CONFIG, verifySession, fetchImpl, env: { ANTHROPIC_API_KEY: 'k' }, pageAccessFilter: (rows) => rows });
	const response = fakeResponse();
	await handler(URL_CHAT, fakeRequest(), response, CONFIG);
	return response;
}

describe('agent 5xx writers hold upstream text back', () => {
	it('the stream error frame of a failed Anthropic call is the fixed sentence', async (t) => {
		const logged = t.mock.method(console, 'error', () => {});
		const response = await runAgent(async () => new Response(LEAK, { status: 500 }));
		assert.equal(response.status, 200);
		assert.ok(!response.text.includes(LEAK), response.text);
		assert.ok(response.text.includes(JSON.stringify({ message: fixedMessage(502) })), response.text);
		assert.ok(logged.mock.calls.some((call) => String(call.arguments[0]).includes(LEAK)));
	});

	it('a tool_result frame for a failed BaaS read carries the fixed sentence', async (t) => {
		t.mock.method(console, 'error', () => {});
		const turns = [toolUseTurn, textTurn];
		const response = await runAgent(async (url) => {
			const path = new URL(String(url)).pathname;
			if (path === '/v1/messages') return new Response(turns.shift(), { status: 200 });
			if (path.endsWith('/osionos_workspace_members')) return Response.json([{ workspace_id: WS }]);
			return new Response(LEAK, { status: 500 });
		});
		assert.equal(response.status, 200);
		assert.ok(response.text.includes('event: tool_result'), response.text);
		assert.ok(!response.text.includes(LEAK), response.text);
	});

	it('a 5xx from the session check answers the fixed sentence with its status', async (t) => {
		t.mock.method(console, 'error', () => {});
		const response = await runAgent(fetch, () => {
			throw Object.assign(new Error('osionos app session secret is not configured.'), { status: 503 });
		});
		assert.equal(response.status, 503);
		assert.equal(JSON.parse(response.text).message, fixedMessage(503));
	});
});
