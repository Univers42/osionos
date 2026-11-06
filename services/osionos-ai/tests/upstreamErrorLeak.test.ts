import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { startKit } from './failoverKit.ts';

/**
 * The words of a provider, through the real SDK: a canary in the body of every
 * failure must reach neither a client nor the logs.
 *
 * The bodies are UNVERIFIED fixtures of the OpenRouter shape, not captures.
 */
const kit = await startKit();
const { app, failing, bridge, mock, runToEnd, runRow, clean } = kit;

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});

/** Not a plain word: the row keeps a provider's `error_type` only when it is one. */
const CANARY = 'sk-or-v1 CANARY acme@example.com';
const providerBody = (message: string, errorType?: string) =>
	JSON.stringify({ error: { code: 400, message, metadata: { provider_name: CANARY, raw: CANARY, ...(errorType ? { error_type: errorType } : {}) } } });

describe('the words of a provider never leave the service', () => {
	const methods = ['log', 'info', 'warn', 'error'] as const;
	const originals = methods.map((method) => console[method]);
	let logged: string[] = [];

	before(clean);
	beforeEach(async () => {
		await clean();
		logged = [];
		for (const method of methods) console[method] = (...args: unknown[]) => void logged.push(args.map(String).join(' '));
	});
	afterEach(() => methods.forEach((method, index) => (console[method] = originals[index])));

	const answers = [
		{ behaviour: 429 as const, retryAfter: '3', body: providerBody(CANARY, CANARY) },
		{ behaviour: 402 as const, body: providerBody(CANARY, CANARY) },
		{ behaviour: 400 as const, body: providerBody(CANARY, CANARY) },
		{ behaviour: 503 as const, body: providerBody(CANARY, CANARY) },
		{ behaviour: 'stream_error' as const, body: JSON.stringify({ error: { message: CANARY, code: 429 } }) },
	];
	for (const answer of answers) {
		it(`${answer.behaviour}: not in a frame, the row, its usage or a log line`, async () => {
			failing.script('mock-metered', answer);
			failing.script('mock-vision', answer);
			const { runId, events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] });
			const row = await runRow(runId);
			assert.ok(!JSON.stringify(events).includes('CANARY'), 'a frame');
			assert.ok(!JSON.stringify(row.error).includes('CANARY'), 'the row');
			assert.ok(!JSON.stringify(row.usage).includes('CANARY'), 'the usage');
			assert.ok(!logged.join('\n').includes('CANARY'), 'a log line');
		});
	}
});
