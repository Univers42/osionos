/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-moderation-retract.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The retraction event of #72: the AI service's L1 classifier holds a feed comment
// after it was published, so the bridge tells the open feeds to read it again. The
// feed's read filter then hides it from everyone but its author.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModerationRetractor, startModerationRetractPoller } from '../../scripts/bridge-moderation-retract.mjs';
import { configFromEnv, createBridgeServer } from '../../scripts/bridge-api.mjs';

const config = { baasUrl: 'http://baas.local', serviceKey: 'service-key' };
const ON = { OSIONOS_MODERATION_STATE: '1' };
const WS = '11111111-1111-4111-8111-111111111111';
const PAGE = '22222222-2222-4222-8222-222222222222';
const HELD = '33333333-3333-4333-8333-333333333333';
const EDITED = '44444444-4444-4444-8444-444444444444';

/** The BaaS: the audit table and the comments table, answered from memory. */
function fakeBaas({ events = [], comments = [] } = {}) {
	const paths = [];
	const fetchImpl = async (url) => {
		const path = decodeURIComponent(String(url).replace(`${config.baasUrl}/rest/v1/`, ''));
		paths.push(path);
		let rows = [];
		if (path.startsWith('ai_moderation_events?') && path.includes('order=id.desc')) {
			rows = events.length ? [{ id: Math.max(...events.map((event) => event.id)) }] : [];
		} else if (path.startsWith('ai_moderation_events?')) {
			const after = Number(/id=gt\.(\d+)/.exec(path)[1]);
			rows = events.filter((event) => event.id > after && event.action === 'hold' && event.subject_kind === 'feed_comment' && event.layer === 'l1');
		} else if (path.startsWith('osionos_feed_comments?')) {
			rows = comments.filter((comment) => comment.moderation_state === 'held' && path.includes(comment.id));
		}
		return new Response(JSON.stringify(rows), { status: 200 });
	};
	return { fetchImpl, paths, events, comments };
}

function recordPublish() {
	const published = [];
	const publish = async ({ topic, eventType, payload }) => { published.push({ topic, eventType, payload }); return true; };
	return { published, publish };
}

const hold = (id, subjectId, extra = {}) => ({ id, subject_kind: 'feed_comment', subject_id: subjectId, workspace_id: WS, layer: 'l1', action: 'hold', ...extra });

describe('the moderation retraction poller (#72)', () => {
	it('a feed comment held after boot is retracted on its page feed, once, with no author', async () => {
		const baas = fakeBaas({ events: [hold(7, 'old')], comments: [{ id: HELD, page_id: PAGE, moderation_state: 'held' }] });
		const { published, publish } = recordPublish();
		const retractor = createModerationRetractor({ config, fetchImpl: baas.fetchImpl, publish });
		await retractor.tick(); // boot: the cursor starts after the existing rows
		assert.deepEqual(published, []);

		baas.events.push(hold(8, HELD));
		await retractor.tick();
		assert.deepEqual(published, [{ topic: `feed:${WS}`, eventType: 'feed_comment_held', payload: { pageId: PAGE, kind: 'comment_held' } }]);

		await retractor.tick();
		assert.equal(published.length, 1, 'a row is never published twice');
	});

	it('allow rows, page comments and a comment no longer held publish nothing', async () => {
		const baas = fakeBaas({ comments: [{ id: EDITED, page_id: PAGE, moderation_state: 'visible' }] });
		const { published, publish } = recordPublish();
		const retractor = createModerationRetractor({ config, fetchImpl: baas.fetchImpl, publish });
		await retractor.tick();
		baas.events.push(hold(1, HELD, { action: 'allow' }), hold(2, HELD, { subject_kind: 'page_comment' }), hold(3, EDITED));
		await retractor.tick();
		assert.deepEqual(published, []);
		assert.ok(baas.paths.some((path) => /id=gt\.0/.test(path)));
	});

	it('the cursor moves past the rows it read, so the next read starts after them', async () => {
		const baas = fakeBaas({ comments: [{ id: HELD, page_id: PAGE, moderation_state: 'held' }] });
		const { publish } = recordPublish();
		const retractor = createModerationRetractor({ config, fetchImpl: baas.fetchImpl, publish });
		await retractor.tick();
		baas.events.push(hold(41, HELD));
		await retractor.tick();
		await retractor.tick();
		assert.match(baas.paths.at(-1), /id=gt\.41/);
	});

	it('a failed read keeps the cursor, so the hold is retracted on the next tick', async () => {
		const baas = fakeBaas({ comments: [{ id: HELD, page_id: PAGE, moderation_state: 'held' }] });
		const { published, publish } = recordPublish();
		let down = false;
		const fetchImpl = (url, init) => (down ? Promise.resolve(new Response('', { status: 503 })) : baas.fetchImpl(url, init));
		const retractor = createModerationRetractor({ config, fetchImpl, publish });
		await retractor.tick();
		baas.events.push(hold(5, HELD));
		down = true;
		await assert.rejects(retractor.tick());
		down = false;
		await retractor.tick();
		assert.equal(published.length, 1);
	});

	it('does not start without the moderation state flag', () => {
		const baas = fakeBaas();
		assert.equal(startModerationRetractPoller({ config, fetchImpl: baas.fetchImpl, env: {} }), null);
		assert.deepEqual(baas.paths, []);
		const poller = startModerationRetractPoller({ config, fetchImpl: baas.fetchImpl, env: ON });
		assert.ok(poller);
		poller.stop();
	});

	it('the bridge starts it on listen when the flag is on, and only then', async () => {
		const serverConfig = configFromEnv({
			OSIONOS_SESSION_CUTOFFS: 'off',
			OSIONOS_SESSION_RECORDS: 'off',
			OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
			OSIONOS_BAAS_URL: config.baasUrl,
			KONG_SERVICE_API_KEY: config.serviceKey,
		});
		for (const [env, expected] of [[ON, true], [{}, false]]) {
			const baas = fakeBaas();
			const server = createBridgeServer({ config: serverConfig, fetchImpl: baas.fetchImpl, env });
			await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
			await new Promise((resolve) => setTimeout(resolve, 50));
			await new Promise((resolve) => server.close(resolve));
			assert.equal(baas.paths.some((path) => path.startsWith('ai_moderation_events?')), expected);
		}
	});
});
