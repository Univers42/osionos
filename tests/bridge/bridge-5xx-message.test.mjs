/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-5xx-message.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A PostgREST failure quotes the table, column or constraint it failed on. A session caller's
// 5xx answer must not carry that text; the server log keeps it. A 4xx answer is untouched.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team]);
const UPSTREAM = { code: '42703', message: 'column osionos_pages.secret_owner_col does not exist' };

/** The page list's one read, an embedded select from the members table, answers `status`. */
function pagesFail(status, body) {
	return createPostgrestMock(teamWorld(), { realWorkspaceRpc: true, failWhen: (call) => (String(call.params.get('select')).includes('osionos_pages') ? { status, body } : null) });
}

describe('a 5xx answer to a session caller', () => {
	it('carries a fixed sentence, never the upstream table or column, and logs the upstream text once', async (t) => {
		const logged = t.mock.method(console, 'error', () => {});
		await withBridge(config, pagesFail(500, UPSTREAM).fetchImpl, async (base) => {
			const r = await send(base, `/api/pages?workspaceId=${IDS.team}`, asA);
			assert.equal(r.status, 502, r.text);
			assert.doesNotMatch(r.text, /osionos_pages|secret_owner_col|42703/);
			assert.deepEqual(r.body, { ok: false, message: 'The service is unavailable; try again.' });
		});
		const lines = logged.mock.calls.map((call) => String(call.arguments[0])).filter((line) => line.includes('secret_owner_col'));
		assert.equal(lines.length, 1, JSON.stringify(lines));
	});
});

describe('a 4xx answer to a session caller', () => {
	it('keeps its message byte for byte', async () => {
		await withBridge(config, pagesFail(500, UPSTREAM).fetchImpl, async (base) => {
			const r = await send(base, '/api/pages', asA);
			assert.deepEqual([r.status, r.text], [422, '{"ok":false,"message":"workspaceId must be a UUID."}']);
		});
	});
});
