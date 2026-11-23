/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-error-sentences.test.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fixedMessage, publicAnswerBody, publicSentence } from '../../scripts/bridge-error-sentences.mjs';

const UPSTREAM = 'BaaS request failed with 500: {"message":"column osionos_pages.owner_col does not exist"}';

describe('publicAnswerBody', () => {
	it('returns a status under 500 body as the same object', () => {
		const body = { ok: false, message: UPSTREAM, code: 'x' };
		assert.equal(publicAnswerBody(404, body), body);
	});

	it('swaps a 5xx message for the fixed sentence, keeps every other field and logs the original once', (t) => {
		const logged = t.mock.method(console, 'error', () => {});
		const body = { ok: false, message: UPSTREAM, error: 'e', code: 'c', details: { a: 1 } };
		assert.equal(JSON.stringify(publicAnswerBody(502, body)), JSON.stringify({ ...body, message: fixedMessage(502) }));
		assert.deepEqual(logged.mock.calls.map((call) => call.arguments[0]), [`bridge: 502 answer: ${UPSTREAM}`]);
	});

	it('keeps a declared bridge sentence and logs nothing', (t) => {
		const logged = t.mock.method(console, 'error', () => {});
		const body = { ok: false, message: publicSentence('The thing HAS happened, but not the rest.') };
		assert.equal(publicAnswerBody(503, body), body);
		assert.equal(logged.mock.callCount(), 0);
	});

	it('masks DSN credentials and user@host pairs in the log line', (t) => {
		const logged = t.mock.method(console, 'error', () => {});
		publicAnswerBody(500, { message: 'dial postgres://app:pw@db:5432 for a@example.com' });
		assert.equal(logged.mock.calls[0].arguments[0], 'bridge: 500 answer: dial postgres://[redacted]@db:5432 for [redacted]');
	});

	it('masks a DSN whose password holds a slash or a quote without leaking its prefix', (t) => {
		const logged = t.mock.method(console, 'error', () => {});
		publicAnswerBody(500, { message: 'dial postgres://app:pa/ss"wd@db:5432/x failed' });
		assert.equal(logged.mock.calls[0].arguments[0], 'bridge: 500 answer: dial postgres://[redacted]@db:5432/x failed');
	});

	it('logs a 50 kB message with CR/LF as one line capped near 500 characters', (t) => {
		const logged = t.mock.method(console, 'error', () => {});
		publicAnswerBody(502, { message: `first\r\nsecond\n${'x'.repeat(50_000)}` });
		assert.equal(logged.mock.callCount(), 1);
		const line = logged.mock.calls[0].arguments[0];
		assert.doesNotMatch(line, /[\r\n]/);
		assert.ok(line.startsWith('bridge: 502 answer: first second x'), line.slice(0, 60));
		assert.ok(line.length <= 540, `${line.length} chars`);
	});

	it('leaves a body without a string message alone', () => {
		for (const body of [null, 'text', [1], { ok: false }, { message: 3 }]) assert.equal(publicAnswerBody(500, body), body);
	});
});
