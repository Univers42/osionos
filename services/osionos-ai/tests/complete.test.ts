import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, USER_A, WORKSPACE_A } from './harness.ts';
import type { JsonBody } from './harness.ts';
import { estimatedLogs, promptCharsOf, spentOf, textOf, usageOf, withLogs } from './ledger.ts';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';
import { builtinCommands, findCommand, renderTemplate } from '../src/commands/builtins.ts';

/**
 * The inline completions: the answer of a command, and what they cost.
 */
const { app, mock, call, postComplete, tokenFor } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
});

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
			model: 'mock-dear',
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

	it('a completion is asked for the usage, and costs the real one', async () => {
		const runId = randomUUID();
		const before = await spentOf(app.db, USER_A);
		const response = await postComplete({
			runId,
			command: 'summarize',
			input: { text: 'the selected words' },
			model: 'mock-metered',
		});
		assert.equal(response.status, 200);
		const events = await collect(new SseStream(response));

		// The request asks for the usage: stream_options.include_usage.
		const body = mock.lastBody() as { stream_options?: { include_usage?: boolean } };
		assert.equal(body.stream_options?.include_usage, true);

		// The usage the upstream reported, and the price of it.
		const usage = usageOf(events);
		assert.equal(usage.inputTokens, 11);
		assert.equal(usage.outputTokens, 7);

		// The ledger moves by exactly that.
		const spent = (await spentOf(app.db, USER_A)) - before;
		assert.ok(spent > 0);
		assert.equal(spent, usage.costMicroUsd);
	});

	it('a completion whose upstream reports no usage still costs the estimate', async () => {
		const runId = randomUUID();
		const before = await spentOf(app.db, USER_A);
		mock.setOptions({ neverSendUsage: true });
		let events: SseEvent[] = [];
		let logs: string[] = [];
		try {
			const captured = await withLogs(async () => {
				const response = await postComplete({
					runId,
					command: 'summarize',
					input: { text: 'the selected words' },
					model: 'mock-metered',
				});
				events = await collect(new SseStream(response));
			});
			logs = captured.logs;
		} finally {
			mock.setOptions({ neverSendUsage: false });
		}

		// The estimate: the characters of the prompt and of the answer, a token
		// every four characters.
		const promptChars = promptCharsOf(mock.lastBody());
		const answerChars = textOf(events).length;
		const estimated = {
			inputTokens: Math.ceil(promptChars / 4),
			outputTokens: Math.ceil(answerChars / 4),
		};
		const usage = usageOf(events);
		assert.equal(usage.inputTokens, estimated.inputTokens);
		assert.equal(usage.outputTokens, estimated.outputTokens);

		// The spend is the estimate, and it is not zero.
		const spent = (await spentOf(app.db, USER_A)) - before;
		assert.ok(spent > 0);
		assert.equal(spent, usage.costMicroUsd);

		// One line says the usage was estimated.
		assert.deepEqual(estimatedLogs(logs), [runId]);
	});
});
