import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { classifyAttachment } from '../src/files/classify.ts';
import { excerptForQuestion, fitFiles } from '../src/files/excerpt.ts';
import { startHarness, USER_A, VISION, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';
import { pngBytes } from './visionFixtures.ts';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('classifyAttachment', () => {
	it('reads a PNG as an image', () => {
		assert.deepEqual(classifyAttachment(pngBytes()), { kind: 'image' });
	});

	it('refuses a PDF and a ZIP or Office header', () => {
		assert.equal(classifyAttachment(encode('%PDF-1.7\nhello')).kind, 'unsupported');
		assert.equal(classifyAttachment(Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 0x61)).kind, 'unsupported');
		assert.equal(classifyAttachment(Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0x61)).kind, 'unsupported');
	});

	it('reads UTF-8 text and drops the BOM', () => {
		const bytes = Uint8Array.of(0xef, 0xbb, 0xbf, ...encode('a,b\n1,é'));
		assert.deepEqual(classifyAttachment(bytes), { kind: 'text', text: 'a,b\n1,é' });
	});

	it('refuses Latin-1 bytes that are not valid UTF-8', () => {
		assert.equal(classifyAttachment(Uint8Array.of(0x63, 0x61, 0x66, 0xe9)).kind, 'unsupported');
	});

	it('refuses a NUL byte', () => {
		assert.equal(classifyAttachment(Uint8Array.of(0x61, 0x00, 0x62)).kind, 'unsupported');
	});
});

describe('excerptForQuestion', () => {
	const needle = 'The zebra ledger closes on the quartz date.';

	function longText(): string {
		const filler = 'alpha beta gamma delta. ';
		const parts = new Array(200_000 / filler.length | 0).fill(filler) as string[];
		const text = parts.join('');
		return `${text.slice(0, 150_000)}${needle}${text.slice(150_000)}`;
	}

	it('returns a short text whole', () => {
		const result = excerptForQuestion('short', 'anything', 24_000);
		assert.equal(result.text, 'short');
		assert.equal(result.excerpt, false);
	});

	it('picks the window of the question, within budget, in document order', () => {
		const text = `HEAD marker\n${longText()}`;
		const result = excerptForQuestion(text, 'when does the zebra ledger close', 24_000);
		assert.equal(result.excerpt, true);
		assert.ok(result.text.length <= 24_000);
		assert.ok(result.text.includes(needle));
		assert.ok(result.windowsUsed > 1 && result.windowsUsed < result.windowsTotal);
		// The first window wins every tie, so HEAD comes before the needle.
		assert.ok(result.text.indexOf('HEAD marker') < result.text.indexOf(needle));
	});

	it('keeps the files of a run under the total', () => {
		const big = 'word '.repeat(30_000);
		const files = [{ name: 'a', text: big }, { name: 'b', text: big }, { name: 'c', text: big }];
		const total = (fitted: { text: string }[]) => fitted.reduce((sum, file) => sum + file.text.length, 0);
		assert.ok(total(fitFiles(files, 'word')) <= 60_000);
		// Under a 24 000 total the first file takes what it can; the remainder
		// is less than one full window, and the second file is flagged cut.
		const tight = fitFiles(files, 'word', 24_000, 24_000);
		assert.ok(total(tight) <= 24_000);
		assert.ok((tight[1]?.text.length ?? 0) < 1_500);
		assert.equal(tight[1]?.excerpt, true);
		assert.equal(fitFiles(files, 'word', 24_000, 0)[0]?.text, '');
	});
});

const { app, base, bridge, mock, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
});

async function runWith(
	bytes: Uint8Array,
	options: { name?: string; model?: string; contentType?: string } = {},
): Promise<{ response: Response; calls: number; path: string }> {
	const token = tokenFor(USER_A, WORKSPACE_A);
	const conversationId = await createConversation();
	const path = `/api/media/uploads/${randomUUID()}/${'b'.repeat(64)}.csv`;
	bridge.serve(path, { bytes, contentType: options.contentType ?? 'text/csv' });
	bridge.reset();
	const calls = mock.calls;
	const response = await fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			runId: randomUUID(),
			conversationId,
			text: 'what is the total?',
			...(options.model ? { model: options.model } : {}),
			attachments: [{ kind: 'media', path, name: options.name ?? 'data.csv' }],
		}),
	});
	return { response, calls, path };
}

describe('a run with an attached file', () => {
	before(() => {
		bridge.reset();
		mock.setOptions({ fail: false });
	});

	it('quotes a CSV on a model without vision, escaped', async () => {
		const { response } = await runWith(encode('item,total\n<b>x</b>,42\n'));
		const events = await collect(new SseStream(response));

		assert.equal(events[events.length - 1]?.event, 'done');
		const sent = JSON.stringify(mock.lastBody());
		assert.ok(sent.includes('<file name=\\"data.csv\\"'), sent.slice(0, 400));
		assert.ok(sent.includes('&lt;b&gt;x&lt;/b&gt;,42'));
		assert.ok(!sent.includes('<b>x'));
	});

	it('refuses a PDF with 415 and calls no upstream', async () => {
		const { response, calls } = await runWith(encode('%PDF-1.7\nbody'), { name: 'a.pdf', contentType: 'application/pdf' });

		assert.equal(response.status, 415);
		assert.equal(((await response.json()) as { code?: string }).code, 'unsupported_file');
		assert.equal(mock.calls, calls);
	});

	it('still refuses an image on a model without vision', async () => {
		const { response, calls } = await runWith(pngBytes(), { name: 'a.png', contentType: 'image/png' });

		assert.equal(response.status, 400);
		assert.equal(((await response.json()) as { code?: string }).code, 'model_no_vision');
		assert.equal(mock.calls, calls);
	});

	it('takes the type from the bytes, not the stored type', async () => {
		const { response } = await runWith(pngBytes(), { name: 'a.txt', contentType: 'text/plain', model: VISION.id });
		const events = await collect(new SseStream(response));
		assert.equal(events[events.length - 1]?.event, 'done');
		assert.ok(!JSON.stringify(mock.lastBody()).includes('<file name='));
	});
});
