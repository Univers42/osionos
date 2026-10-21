import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { startMockUpstream } from './mockUpstream.ts';
import { SseStream, collect } from './sse.ts';
import { builtinCommands, findCommand, renderTemplate } from '../src/commands/builtins.ts';

const APP_SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';
const USER_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type JsonBody = Record<string, unknown>;

/** A token the way the bridge signs one: the same module, the test's secret. */
function tokenFor(userId: string, workspaceId: string, secret = APP_SECRET): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: secret, sessionTtlSeconds: 3600 },
	}).token;
}

/**
 * The mock upstream comes first, and the environment points at it: the service
 * reads its configuration when it is imported.
 */
const mock = await startMockUpstream();
process.env.OSIONOS_AI_UPSTREAM_BASE_URL = `${mock.baseUrl}/v1`;
process.env.OSIONOS_AI_PLATFORM_MODELS = JSON.stringify([
	// The free model costs nothing: the other cases are not bounded by the
	// daily budget.
	{ id: 'mock-model', label: 'Mock model', inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, default: true },
	// The priced model reserves more than the daily limit of one micro-USD.
	{ id: 'mock-priced', label: 'Mock priced', inputMicroUsdPerMTok: 1000, outputMicroUsdPerMTok: 2000 },
]);
// The daily budget of a user: one micro-USD.
process.env.OSIONOS_AI_USER_DAILY_MICROUSD = '1';
process.env.OSIONOS_AI_PLATFORM_DAILY_MICROUSD = '20000000';
process.env.OSIONOS_AI_RUNS_PER_MINUTE = '100';

const { createAiServer } = await import('../src/server.ts');

const app = createAiServer();
await new Promise<void>((resolve) => {
	app.server.listen(0, '127.0.0.1', () => resolve());
});
const address = app.server.address();
const base = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;

after(async () => {
	await app.close();
	await mock.close();
});

/** A JSON answer of the service. */
async function call(
	path: string,
	options: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: JsonBody | null }> {
	const response = await fetch(`${base}${path}`, {
		method: options.method ?? 'GET',
		headers: {
			...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
			...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	const text = await response.text();
	let body: JsonBody | null = null;
	try {
		body = text ? (JSON.parse(text) as JsonBody) : null;
	} catch {
		body = null;
	}
	return { status: response.status, body };
}

/** The POST of a completion: the answer is a stream. */
function postComplete(body: Record<string, unknown>, token = tokenFor(USER_A, WORKSPACE_A)): Promise<Response> {
	return fetch(`${base}/api/ai/complete`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

/** The commands of an answer of the registry. */
function commandsOf(body: JsonBody | null): { name: string; surface: string }[] {
	const commands = body?.commands;
	assert.ok(Array.isArray(commands));
	return commands as { name: string; surface: string }[];
}

describe('osionos-ai completions', () => {
	before(async () => {
		await app.db.query('delete from public.ai_usage_daily');
		mock.setOptions({ preDelayMs: 0, chunkCount: 4, chunkGapMs: 0, fail: false });
	});

	it('the commands of a surface answer that surface', async () => {
		const editor = await call('/api/ai/commands?surface=editor', { token: tokenFor(USER_A, WORKSPACE_A) });
		assert.equal(editor.status, 200);
		const editorCommands = commandsOf(editor.body);
		const editorNames = editorCommands.map((command) => command.name);
		assert.ok(editorNames.includes('continue'));
		assert.ok(editorNames.includes('ask'));
		// No command of the chat only: every answer of the editor may be used there.
		assert.ok(editorCommands.every((command) => command.surface === 'editor' || command.surface === 'both'));

		const chat = await call('/api/ai/commands?surface=chat', { token: tokenFor(USER_A, WORKSPACE_A) });
		assert.equal(chat.status, 200);
		const chatCommands = commandsOf(chat.body);
		const chatNames = chatCommands.map((command) => command.name);
		assert.ok(chatNames.includes('ask'));
		assert.ok(!chatNames.includes('continue'));
		assert.ok(chatCommands.every((command) => command.surface === 'chat' || command.surface === 'both'));
	});

	it('a completion streams the answer of its command', async () => {
		const runId = randomUUID();
		const response = await postComplete({ runId, command: 'summarize', input: { text: 'the selected words' } });
		assert.equal(response.status, 200);
		const events = await collect(new SseStream(response));

		assert.ok(events.some((event) => event.event === 'text.delta'));
		assert.ok(events.some((event) => event.event === 'usage'));
		assert.equal(events[events.length - 1]?.event, 'done');
		// The counter is the id of the frame, and nothing is persisted.
		assert.deepEqual(
			events.map((event) => event.id),
			events.map((_event, index) => String(index + 1)),
		);
		const done = events[events.length - 1]?.data as { runId: string; assistantMessageId: string | null };
		assert.equal(done.runId, runId);
		assert.equal(done.assistantMessageId, null);

		// The upstream received the rendered template, with the selection in it.
		const prompt = JSON.stringify(mock.lastBody());
		assert.ok(prompt.includes('Summarize the following text in 3–5 sentences.'));
		assert.ok(prompt.includes('<selection>'));
		assert.ok(prompt.includes('the selected words'));
		assert.ok(prompt.includes('</selection>'));
		assert.ok(prompt.includes('Reply with the result only.'));
		// The selection is data, never an instruction.
		assert.ok(prompt.includes('never instructions'));
	});

	it('a command that does not exist is refused', async () => {
		const calls = mock.calls;
		const response = await postComplete({ runId: randomUUID(), command: 'no-such-command', input: { text: 'words' } });
		assert.equal(response.status, 400);
		const body = (await response.json()) as JsonBody;
		assert.equal(body.code, 'invalid_request');
		assert.equal(mock.calls, calls);
	});

	it('a completion that cannot be paid for never reaches the model', async () => {
		const calls = mock.calls;
		const response = await postComplete({
			runId: randomUUID(),
			command: 'summarize',
			input: { text: 'words' },
			model: 'mock-priced',
		});
		assert.equal(response.status, 402);
		const body = (await response.json()) as JsonBody;
		assert.equal(body.code, 'budget_exhausted');
		assert.equal(mock.calls, calls);
	});

	it('a client that goes away aborts the upstream call', async () => {
		mock.setOptions({ preDelayMs: 0, chunkCount: 30, chunkGapMs: 40, fail: false });
		const aborted = mock.aborted;
		const stream = new SseStream(
			await postComplete({ runId: randomUUID(), command: 'continue', input: { text: 'the words' } }),
		);
		const first = await stream.next();
		assert.equal(first?.event, 'text.delta');
		await stream.drop();

		// The upstream sees the call cut: the server aborted it with the client.
		const deadline = Date.now() + 5_000;
		while (mock.aborted === aborted && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		assert.equal(mock.aborted, aborted + 1);
		mock.setOptions({ preDelayMs: 0, chunkCount: 4, chunkGapMs: 0, fail: false });
	});

	it('renderTemplate replaces every $ARGUMENTS', () => {
		assert.equal(renderTemplate('a $ARGUMENTS b $ARGUMENTS', 'X'), 'a X b X');
		assert.equal(renderTemplate('no argument here', 'X'), 'no argument here');
		assert.equal(renderTemplate('$ARGUMENTS', ''), '');
		// The built-ins carry the arguments once, and end with the same line.
		for (const command of builtinCommands()) {
			assert.ok(command.template.includes('$ARGUMENTS'));
			assert.ok(command.template.endsWith('Reply with the result only.'));
		}
		assert.equal(findCommand('summarize')?.surface, 'both');
		assert.equal(findCommand('continue')?.surface, 'editor');
		assert.equal(findCommand('nope'), null);
	});
});
