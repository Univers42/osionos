/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-perms-rules-list.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * listForPage: the rules that decide ONE page's access — the page's own rules and the
 * workspace-wide ones (resource_id = ''), and nothing else.
 *
 * Two reads, not one: a workspace with hundreds of rules about OTHER pages must not
 * truncate the page's own rule (the reviewer's seed: 500 other page rules plus one
 * no_access on P still denies P).
 *
 * A missing table answers [] (no rule can exist); every other failure is a 503, never a
 * silent "no rules" — that would drop a deny the caller is under, and hand the page to
 * somebody who must not have it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createShareRuleStore } from '../../scripts/bridge-perms-rules.mjs';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const PAGE = '33333333-3333-4333-8333-333333333333';
const OTHER_PAGE = '44444444-4444-4444-8444-444444444444';
const CONFIG = { baasUrl: 'http://kong.test', serviceKey: 'svc-key' };

/** A stored rule row (the shape public.osionos_share_rules holds). */
function row(over = {}) {
	return {
		id: '55555555-5555-4555-8555-555555555555',
		workspace_id: WS,
		resource_type: 'page',
		resource_id: PAGE,
		target: { type: 'user', userId: 'u1' },
		target_key: 'user:u1:',
		permission: 'can_view',
		explicit: true,
		created_at: '2026-10-01T00:00:00Z',
		updated_at: '2026-10-01T00:00:00Z',
		...over,
	};
}

/** A fetch stand-in that answers the store's two reads from `rows`. */
function fakeFetch(rows, { status = 200, body } = {}) {
	const calls = [];
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		calls.push({ url: parsed, method: init.method ?? 'GET' });
		if (status !== 200) return new Response(body ?? JSON.stringify({ code: 'XX' }), { status });
		if (body !== undefined) return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
		const wanted = parsed.searchParams.get('resource_id');
		const value = wanted === null ? null : wanted.slice('eq.'.length);
		const matched = rows.filter((candidate) => candidate.workspace_id === parsed.searchParams.get('workspace_id').slice('eq.'.length)
			&& candidate.resource_type === parsed.searchParams.get('resource_type').slice('eq.'.length)
			&& (value === null || candidate.resource_id === value));
		return new Response(JSON.stringify(matched), { status: 200, headers: { 'content-type': 'application/json' } });
	};
	return { calls, fetchImpl };
}

describe('listForPage answers the page rules and the workspace-wide ones', () => {
	it('returns both, and nothing else', async () => {
		const rows = [
			row({ id: 'a', resource_id: PAGE, permission: 'can_view' }),
			row({ id: 'b', resource_id: '', permission: 'no_access' }),
			row({ id: 'c', resource_id: OTHER_PAGE, permission: 'can_edit' }),
			row({ id: 'd', resource_id: PAGE, workspace_id: OTHER_WS, permission: 'can_edit' }),
			row({ id: 'e', resource_id: PAGE, resource_type: 'database', permission: 'can_edit' }),
		];
		const { calls, fetchImpl } = fakeFetch(rows);
		const store = createShareRuleStore({ fetchImpl });
		const rules = await store.listForPage(CONFIG, WS, PAGE);
		assert.deepEqual(rules.map((rule) => rule.id).sort(), ['a', 'b']);
		assert.equal(calls.length, 2);
	});

	it('asks for the page rules and the workspace-wide rules, in that workspace', async () => {
		const { calls, fetchImpl } = fakeFetch([]);
		const store = createShareRuleStore({ fetchImpl });
		await store.listForPage(CONFIG, WS, PAGE);
		const [pageRead, wideRead] = calls;
		assert.equal(pageRead.url.pathname, '/rest/v1/osionos_share_rules');
		assert.equal(pageRead.url.searchParams.get('workspace_id'), `eq.${WS}`);
		assert.equal(pageRead.url.searchParams.get('resource_type'), 'eq.page');
		assert.equal(pageRead.url.searchParams.get('resource_id'), `eq.${PAGE}`);
		assert.equal(wideRead.url.searchParams.get('resource_id'), 'eq.');
		assert.ok(Number(pageRead.url.searchParams.get('limit')) > 0);
	});

	it('a workspace with hundreds of rules about other pages still answers the page rule', async () => {
		const rows = [
			...Array.from({ length: 500 }, (_, index) => row({ id: `other-${index}`, resource_id: `page-${index}` })),
			row({ id: 'mine', resource_id: PAGE, permission: 'no_access' }),
		];
		const { fetchImpl } = fakeFetch(rows);
		const store = createShareRuleStore({ fetchImpl });
		const rules = await store.listForPage(CONFIG, WS, PAGE);
		assert.deepEqual(rules.map((rule) => rule.id), ['mine']);
	});
});

describe('a store failure is never a silent "no rules"', () => {
	it('a missing table answers [] — no rule can exist', async () => {
		for (const [status, code] of [[404, '42P01'], [404, 'PGRST205'], [400, '42P01']]) {
			const { fetchImpl } = fakeFetch([], { status, body: JSON.stringify({ code }) });
			const store = createShareRuleStore({ fetchImpl, log: () => {} });
			assert.deepEqual(await store.listForPage(CONFIG, WS, PAGE), [], `status ${status} code ${code}`);
		}
	});

	it('every other failure is a 503 with a stable code', async () => {
		for (const status of [401, 403, 409, 500, 502, 503]) {
			const { fetchImpl } = fakeFetch([], { status, body: JSON.stringify({ code: 'XX', message: 'internal detail' }) });
			const store = createShareRuleStore({ fetchImpl, log: () => {} });
			await assert.rejects(store.listForPage(CONFIG, WS, PAGE), (error) => {
				assert.equal(error.status, 503, `upstream ${status}`);
				assert.equal(error.code, 'share_rules_unavailable');
				assert.doesNotMatch(error.message, /internal detail/);
				return true;
			}, `upstream ${status}`);
		}
	});

	it('a 404 that is not a missing table is a 503, not an empty rule set', async () => {
		// Only PGRST205/42P01 mean the table is gone. Any other 404 is a broken read, and
		// answering [] for it would drop every deny the caller is under.
		const answers = [
			JSON.stringify({ code: 'PGRST999', message: 'something else' }),
			'Not Found',
			'',
		];
		for (const body of answers) {
			const { fetchImpl } = fakeFetch([], { status: 404, body });
			const store = createShareRuleStore({ fetchImpl, log: () => {} });
			await assert.rejects(store.listForPage(CONFIG, WS, PAGE), (error) => {
				assert.equal(error.status, 503, `body ${JSON.stringify(body)}`);
				assert.equal(error.code, 'share_rules_unavailable');
				return true;
			}, `body ${JSON.stringify(body)}`);
		}
	});

	it('a 200 with an empty body is a broken read, not an empty rule set', async () => {
		const { fetchImpl } = fakeFetch([], { body: '' });
		const store = createShareRuleStore({ fetchImpl, log: () => {} });
		await assert.rejects(store.listForPage(CONFIG, WS, PAGE), (error) => {
			assert.equal(error.status, 503);
			assert.equal(error.code, 'share_rules_unavailable');
			return true;
		});
	});

	it('a read that hit the cap is a 503, not a truncated rule set', async () => {
		// The read is limited, so a full page of rules may hide a deny beyond the cap.
		const rows = Array.from({ length: 500 }, (_, index) => row({ id: `full-${index}`, resource_id: PAGE }));
		const { fetchImpl } = fakeFetch(rows);
		const store = createShareRuleStore({ fetchImpl, log: () => {} });
		await assert.rejects(store.listForPage(CONFIG, WS, PAGE), (error) => {
			assert.equal(error.status, 503);
			assert.equal(error.code, 'share_rules_unavailable');
			return true;
		});
	});
});
