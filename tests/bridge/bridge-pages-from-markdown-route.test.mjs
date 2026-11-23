// osionos#240, the route module alone with bridge-api's dependencies faked: the order of its
// guards (M240-5: the 429 comes before the body is read or parsed) and its failure mapping
// (M240-9: a parser exception or a refused block is a 422, never a 500 or a crash).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createFromMarkdownRoute, FROM_MARKDOWN_LIMIT, FROM_MARKDOWN_PATH } from '../../scripts/bridge-pages-from-markdown.mjs';
import { validatedPageContent } from '../../scripts/bridge-content-validation.mjs';
import { IDS, harnessConfig, sessionHeaders } from './support/bridge-harness.mjs';

const config = harnessConfig();
const url = new URL(`http://bridge${FROM_MARKDOWN_PATH}`);

/** A request whose body records whether anything read it. */
function request(headers, body) {
	const stream = new Readable({
		read() {
			stream.wasRead = true;
			this.push(Buffer.from(body));
			this.push(null);
		},
	});
	stream.wasRead = false;
	stream.headers = { ...headers, 'content-length': String(Buffer.byteLength(body)) };
	return stream;
}

/** The route over fakes; `calls` counts what reached each dependency. */
function route({ parse = () => [], rowFromPayload = (payload) => ({ title: payload.title || 'Untitled', content: validatedPageContent(payload.content) }) } = {}) {
	const calls = { parse: 0, insert: 0, replies: [] };
	const handle = createFromMarkdownRoute({
		authorizePageCreate: async () => ({ userId: 'caller' }),
		rowFromPayload,
		insertPage: async (_config, _fetch, row) => { calls.insert += 1; return [{ ...row, id: 'new-page' }]; },
		pageVersionOf: () => null,
		json: (_response, status, body) => calls.replies.push({ status, body }),
		parse: (markdown) => { calls.parse += 1; return parse(markdown); },
	});
	return { calls, handle: (headers, body) => handle(url, request(headers, body), {}, config, fetch) };
}

const body = JSON.stringify({ workspaceId: IDS.team, title: 'T', markdown: '# x' });
const userHeaders = () => sessionHeaders(config, randomUUID(), randomUUID());

describe('the from-markdown route module', () => {
	it('answers 429 with a Retry-After before reading or parsing the request (M240-5)', async () => {
		const { calls, handle } = route();
		const headers = userHeaders();
		for (let index = 0; index < FROM_MARKDOWN_LIMIT.capacity; index += 1) await handle(headers, body);
		assert.equal(calls.parse, FROM_MARKDOWN_LIMIT.capacity);
		const limited = request(headers, body);
		const handler = createFromMarkdownRoute({ parse: () => assert.fail('parsed past the limit') });
		await assert.rejects(handler(url, limited, {}, config, fetch), (error) => error.status === 429 && Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0);
		assert.equal(limited.wasRead, false);
		assert.equal(calls.parse, FROM_MARKDOWN_LIMIT.capacity);
	});

	it('turns a parser exception into a 422 and writes nothing (M240-9)', async () => {
		const { calls, handle } = route({ parse: () => { throw new RangeError('Maximum call stack size exceeded'); } });
		await assert.rejects(handle(userHeaders(), body), (error) => error.status === 422 && !error.message.includes('stack'));
		assert.equal(calls.insert, 0);
		assert.deepEqual(calls.replies, []);
	});

	it('turns a block the validator refuses into a 422 and writes nothing (M240-9)', async () => {
		const { calls, handle } = route({ parse: () => [{ type: '', content: 'x' }] });
		await assert.rejects(handle(userHeaders(), body), (error) => error.status === 422);
		assert.equal(calls.insert, 0);
	});

	it('leaves other paths to the next handler', async () => {
		const unread = request({}, '');
		assert.equal(await createFromMarkdownRoute({})(new URL('http://bridge/api/pages'), unread, {}, config, fetch), false);
		assert.equal(unread.wasRead, false);
	});
});
