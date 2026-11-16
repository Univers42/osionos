/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-object-db-list-shape.test.mjs               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/16 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/16 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The database list used to answer 200 `{databases: []}` for any 2xx upstream it could not read
// as rows: a body-less answer or a non-array one. A client cannot tell that from "this account has
// no databases" (groot ADR 0051, devil A3). Only a real `[]` is an empty list.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);

/** The list read answers `answer()`; every other call goes to the mock. */
function listAnswers(answer) {
	const mock = createPostgrestMock();
	return (url, init) => (String(url).includes('/rest/v1/osionos_object_databases') ? answer() : mock.fetchImpl(url, init));
}

const listWith = (answer) => withBridge(config, listAnswers(answer), (base) => send(base, '/api/object-databases', asB));
const ok = (body) => () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });

describe('the object-database list', () => {
	it('answers 502 when the upstream 2xx is not an array', async () => {
		const answer = await listWith(ok('{"message":"not rows"}'));
		assert.equal(answer.status, 502);
		assert.equal(answer.body?.databases, undefined);
	});

	it('answers 502 when the upstream 2xx has no body', async () => {
		assert.equal((await listWith(ok(null))).status, 502);
	});

	it('keeps a real empty list a 200 with no databases', async () => {
		const answer = await listWith(ok('[]'));
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { databases: [] });
	});
});
