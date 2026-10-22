/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-moderation-gate.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The GATE: every row of the decision table, and the one audit row a decision
 * leaves behind. Pure — no bridge, no database, no env.
 *
 * The blocklisted word is READ from the list at runtime, never pasted here: the
 * test must follow the list, not a copy of it, or a list update would leave the
 * test proving the wrong word.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { decideWrite, recordDecision } from '../../scripts/bridge-moderation-gate.mjs';

const LIST = readFileSync(new URL('../../scripts/moderation-lists/en.txt', import.meta.url), 'utf8')
	.split('\n')
	.map((line) => line.trim())
	.filter((line) => line.length > 0);
const TERM = LIST.find((term) => /^[a-z]{4,}$/.test(term));
const BLOCKED = `what a ${TERM} you are`;
const LINK_FLOOD = [
	'https://one.example/a', 'https://two.example/b', 'https://three.example/c',
	'https://four.example/d', 'https://five.example/e', 'https://six.example/f',
].join(' ');
const CLEAN = 'a plain comment about the weather';

/** The gate's defaults, so every case states only what it is about. */
const decide = (over = {}) => decideWrite({ text: CLEAN, surface: 'feed_comment', mode: 'log', publicReadable: false, acknowledged: false, stateEnabled: false, ...over });

/** A fetch that records the calls it is given and answers 2xx. */
function recorder({ ok = true, status = 201 } = {}) {
	const calls = [];
	const fetchImpl = async (url, init = {}) => {
		calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
		return { ok, status, text: async () => '' };
	};
	return { calls, fetchImpl };
}

const config = { baasUrl: 'http://baas', serviceKey: 'k' };

describe('decideWrite — the decision table', () => {
	it('off: nothing is applied and nothing is recorded', () => {
		const result = decide({ mode: 'off', text: BLOCKED, publicReadable: true, stateEnabled: true });
		assert.equal(result.outcome, 'write');
		assert.equal(result.record, null);
	});

	it('log + allow: the write happens and nothing is recorded', () => {
		const result = decide({ mode: 'log', text: CLEAN, publicReadable: true, stateEnabled: true });
		assert.equal(result.outcome, 'write');
		assert.equal(result.record, null);
	});

	it('log + warn: the write happens and the would-be verdict is recorded (shadow)', () => {
		const result = decide({ mode: 'log', text: BLOCKED, publicReadable: true, stateEnabled: true });
		assert.equal(result.outcome, 'write');
		assert.equal(result.record, 'warn');
		assert.deepEqual(result.codes, ['blocklist']);
		assert.deepEqual(result.terms, [TERM]);
	});

	it('log + hold: the write happens and the hold is recorded (shadow)', () => {
		const result = decide({ mode: 'log', text: LINK_FLOOD, publicReadable: true, stateEnabled: true });
		assert.equal(result.outcome, 'write');
		assert.equal(result.record, 'hold');
		assert.deepEqual(result.codes, ['links']);
	});

	for (const mode of ['hold', 'on']) {
		it(`${mode} + allow: the write happens`, () => {
			const result = decide({ mode, text: CLEAN, publicReadable: true, stateEnabled: true });
			assert.equal(result.outcome, 'write');
			assert.equal(result.record, null);
		});

		it(`${mode} + warn, not acknowledged: the author is asked, and nothing is recorded`, () => {
			const result = decide({ mode, text: BLOCKED, publicReadable: true, stateEnabled: true });
			assert.equal(result.outcome, 'needs_ack');
			assert.equal(result.record, null);
			assert.deepEqual(result.codes, ['blocklist']);
		});

		it(`${mode} + warn, acknowledged: the write happens and the warning is recorded`, () => {
			const result = decide({ mode, text: BLOCKED, publicReadable: true, acknowledged: true, stateEnabled: true });
			assert.equal(result.outcome, 'write');
			assert.equal(result.record, 'warn');
		});

		it(`${mode} + hold on a public subject: the comment is written HELD`, () => {
			const result = decide({ mode, text: LINK_FLOOD, publicReadable: true, stateEnabled: true });
			assert.equal(result.outcome, 'write_held');
			assert.equal(result.record, 'hold');
		});

		it(`${mode} + hold on a subject the public may not read: the author is asked, never held`, () => {
			const asked = decide({ mode, text: LINK_FLOOD, publicReadable: false, stateEnabled: true });
			assert.equal(asked.outcome, 'needs_ack');
			assert.equal(asked.record, null);
			const written = decide({ mode, text: LINK_FLOOD, publicReadable: false, acknowledged: true, stateEnabled: true });
			assert.equal(written.outcome, 'write');
			assert.equal(written.record, null);
		});
	}

	it('a private subject is never held and never recorded (C94)', () => {
		const privateHold = decide({ mode: 'on', text: LINK_FLOOD, publicReadable: false, acknowledged: true, stateEnabled: true });
		assert.equal(privateHold.outcome, 'write');
		assert.equal(privateHold.record, null);
		const privateWarn = decide({ mode: 'on', text: BLOCKED, publicReadable: false, acknowledged: true, stateEnabled: true });
		assert.equal(privateWarn.record, null);
	});

	it('the state flag off: nothing is ever recorded, whatever the mode', () => {
		for (const mode of ['off', 'log', 'hold', 'on']) {
			for (const publicReadable of [true, false]) {
				const result = decide({ mode, text: LINK_FLOOD, publicReadable, acknowledged: true, stateEnabled: false });
				assert.equal(result.record, null, `${mode}/${publicReadable}`);
				assert.notEqual(result.outcome, 'write_held', `${mode}/${publicReadable}`);
			}
		}
	});

	it('every answer carries the codes, the terms and the policy hash', () => {
		const result = decide({ mode: 'hold', text: BLOCKED, publicReadable: true, stateEnabled: true });
		assert.match(result.policyHash, /^[0-9a-f]{64}$/);
		assert.deepEqual(result.codes, ['blocklist']);
		assert.deepEqual(result.terms, [TERM]);
		const clean = decide({ mode: 'hold', text: CLEAN });
		assert.deepEqual(clean.codes, []);
		assert.deepEqual(clean.terms, []);
	});
});

describe('recordDecision — the one audit row', () => {
	const decision = {
		subjectKind: 'feed_comment',
		subjectId: '11111111-2222-4333-8444-555555555555',
		workspaceId: '99999999-2222-4333-8444-555555555555',
		authorId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
		action: 'warn',
		mode: 'hold',
		policyHash: 'a'.repeat(64),
		content: BLOCKED,
	};

	it('inserts ONE row of ai_moderation_events, with the content as a sha256', async () => {
		const { calls, fetchImpl } = recorder();
		await recordDecision(config, fetchImpl, decision);
		assert.equal(calls.length, 1);
		assert.match(calls[0].url, /ai_moderation_events$/);
		const body = calls[0].body;
		assert.equal(body.subject_kind, 'feed_comment');
		assert.equal(body.subject_id, decision.subjectId);
		assert.equal(body.workspace_id, decision.workspaceId);
		assert.equal(body.author_id, decision.authorId);
		assert.equal(body.layer, 'l0');
		assert.equal(body.action, 'warn');
		assert.equal(body.mode, 'hold');
		assert.equal(body.policy_hash, decision.policyHash);
		assert.equal(body.reason, 'blocklist');
		assert.equal(body.content_sha256, createHash('sha256').update(BLOCKED, 'utf8').digest('hex'));
	});

	it('names the reason codes on its own, from the content and the subject kind', async () => {
		const { calls, fetchImpl } = recorder();
		await recordDecision(config, fetchImpl, { ...decision, subjectKind: 'page_comment', content: LINK_FLOOD });
		assert.equal(calls[0].body.reason, 'links');
	});

	it('never writes the content and never writes the terms (C94)', async () => {
		const { calls, fetchImpl } = recorder();
		await recordDecision(config, fetchImpl, decision);
		const body = calls[0].body;
		assert.equal(body.content, undefined);
		assert.equal(body.terms, undefined);
		assert.ok(!JSON.stringify(body).includes(TERM), 'the matched term reached the audit row');
		assert.ok(!JSON.stringify(body).includes(BLOCKED), 'the content reached the audit row');
	});

	it('a failed insert is a warn: the write that triggered it still succeeds', async () => {
		const { calls, fetchImpl } = recorder({ ok: false, status: 500 });
		const recorded = await recordDecision(config, fetchImpl, decision);
		assert.equal(recorded, false);
		assert.equal(calls.length, 1);
	});
});
