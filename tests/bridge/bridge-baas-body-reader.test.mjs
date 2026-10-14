/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-baas-body-reader.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The one reader every BaaS 2xx answer goes through, taken on its own: the four
// outcomes each caller's own error shape wraps. `fail` is what the caller supplies
// to keep its own error type, so the reader must hand back exactly the error `fail`
// returned — never a re-wrapped, re-typed, or re-levelled one.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readBaasJson } from '../../scripts/bridge-baas-body.mjs';

const SERVICE = 'share rules';
const GARBLED = '[{"id":"x"';

/** A 200 whose body stops after a partial object and errors mid-stream. */
function cutResponse() {
	return new Response(new ReadableStream({
		start(control) {
			control.enqueue(new TextEncoder().encode('{"id":'));
			control.error(new Error('terminated'));
		},
	}), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** A 200 whose body is text that is not JSON. */
const garbledResponse = () => new Response(GARBLED, { status: 200, headers: { 'content-type': 'application/json' } });

/** A 2xx that carries no body at all — the one case that still reads as empty. */
const emptyResponse = () => new Response(null, { status: 204 });

/** A 2xx whose body is present and parses. */
const jsonResponse = () => new Response(JSON.stringify([{ id: 'row-1' }]), { status: 200, headers: { 'content-type': 'application/json' } });

/**
 * The caller's own error factory, remembering every error it built so a test can
 * check the reader threw that very object, not a lookalike.
 */
function failFactory() {
	const built = [];
	const fail = (message) => {
		const error = Object.assign(new Error(message), { status: 502, marker: Symbol.for(`marker:${built.length}`) });
		built.push(error);
		return error;
	};
	return { fail, built };
}

describe('readBaasJson reads one BaaS 2xx answer four ways', () => {
	it('throws exactly the error `fail` returned when the body stops mid-stream', async () => {
		const { fail, built } = failFactory();
		await assert.rejects(readBaasJson(cutResponse(), { service: SERVICE, empty: null, fail }), (error) => {
			assert.equal(error, built[0], 'the read failure must surface as the caller\'s own error object');
			assert.equal(error.status, 502, error.message);
			assert.equal(error.message, `BaaS response body could not be read (${SERVICE}).`);
			return true;
		});
	});

	it('throws exactly the error `fail` returned, naming the byte length, when the body is not JSON', async () => {
		const { fail, built } = failFactory();
		await assert.rejects(readBaasJson(garbledResponse(), { service: SERVICE, empty: [], fail }), (error) => {
			assert.equal(error, built[0], 'the parse failure must surface as the caller\'s own error object');
			assert.equal(error.status, 502, error.message);
			assert.equal(error.message, `BaaS response body was not valid JSON (${Buffer.byteLength(GARBLED)} bytes).`);
			return true;
		});
	});

	it('answers the caller\'s own `empty` for a body-less 2xx, whatever value that is', async () => {
		for (const empty of [null, [], { rows: 0 }]) {
			const { fail, built } = failFactory();
			assert.deepEqual(await readBaasJson(emptyResponse(), { service: SERVICE, empty, fail }), empty);
			assert.equal(built.length, 0, 'a body-less answer is not a failure');
		}
	});

	it('answers `empty` for a 2xx whose body is an empty string', async () => {
		const { fail } = failFactory();
		const blank = new Response('', { status: 200, headers: { 'content-type': 'application/json' } });
		assert.equal(await readBaasJson(blank, { service: SERVICE, empty: null, fail }), null);
	});

	it('answers the parsed value when the body is JSON', async () => {
		const { fail, built } = failFactory();
		const parsed = await readBaasJson(jsonResponse(), { service: SERVICE, empty: null, fail });
		assert.deepEqual(parsed, [{ id: 'row-1' }]);
		assert.equal(built.length, 0, 'a readable answer is not a failure');
	});
});
