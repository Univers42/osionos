import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { startKit } from './failoverKit.ts';

/**
 * The summariser's own call to the provider: a canary in the body of its
 * failure must reach no log line. The run that triggers it is answered fine,
 * so the failure belongs to the summary alone.
 *
 * The bodies are UNVERIFIED fixtures of the OpenRouter shape, not captures.
 */
process.env.OSIONOS_AI_SUMMARY = 'on';
const kit = await startKit();
const { app, failing, bridge, mock, post, clean } = kit;
const { summariesSettled } = await import('../src/summary/summarize.ts');
const { createConversation } = kit;

after(async () => {
	await summariesSettled();
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});

const CANARY = 'sk-or-v1 CANARY acme@example.com';
const providerBody = JSON.stringify({ error: { code: 400, message: CANARY, metadata: { provider_name: CANARY, raw: CANARY } } });

/** Ten turns of 5 000 characters: more than the history window, so the run schedules a summary. */
async function seedThread(conversationId: string): Promise<void> {
	for (let index = 0; index < 10; index += 1) {
		await app.db.query(
			`insert into public.ai_messages (conversation_id, role, parts, created_at)
			 values ($1, $2, $3::jsonb, now() - interval '1 hour' + $4 * interval '1 second')`,
			[conversationId, index % 2 === 0 ? 'user' : 'assistant', JSON.stringify([{ type: 'text', text: `T${index}-${'x'.repeat(4997)}` }]), index],
		);
	}
}

describe('the words of a provider never reach the log through the summary', () => {
	const methods = ['log', 'info', 'warn', 'error'] as const;
	const originals = methods.map((method) => console[method]);
	let logged: string[] = [];

	beforeEach(async () => {
		await clean();
		logged = [];
		for (const method of methods) console[method] = (...args: unknown[]) => void logged.push(args.map(String).join(' '));
	});
	afterEach(() => methods.forEach((method, index) => (console[method] = originals[index])));

	const answers = [
		{ behaviour: 400 as const, body: providerBody },
		{ behaviour: 503 as const, body: providerBody },
		{ behaviour: 'stream_error' as const, body: JSON.stringify({ error: { message: CANARY, code: 429 } }) },
	];
	for (const answer of answers) {
		it(`${answer.behaviour}: the summary fails, the run does not, no log line holds the body`, async () => {
			const conversationId = await createConversation();
			await seedThread(conversationId);
			failing.script('mock-metered', 'ok', answer);
			const response = await post({ runId: randomUUID(), conversationId, text: 'hello', model: 'mock-metered' });
			assert.equal(response.status, 200);
			await response.text();
			await summariesSettled();
			assert.equal(failing.countFor('mock-metered'), 2, 'the run and the summary each called the provider');
			assert.ok(logged.some((line) => line.includes('summary_failed')), 'the failure is one coded line');
			assert.ok(!logged.join('\n').includes('CANARY'), 'a log line');
		});
	}
});
