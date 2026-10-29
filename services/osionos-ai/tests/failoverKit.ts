import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startFailingUpstream } from './mockFailing.ts';
import { startHarness, USER_A, WORKSPACE_A } from './harness.ts';
import { spentOf } from './ledger.ts';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The setup of the failover tests: a scripted upstream, the service on it, and
 * the few reads of the money they all make.
 *
 * The environment is set before the harness imports the service, because the
 * service reads it once, when it is imported.
 */

export async function startKit() {
	const failing = await startFailingUpstream();
	process.env.OSIONOS_AI_KEK = Buffer.alloc(32, 7).toString('base64');
	process.env.OSIONOS_AI_KEK_ID = 'k1';
	process.env.OSIONOS_AI_DEV_ENDPOINT_HOSTS = '127.0.0.1';
	process.env.OSIONOS_AI_DEV_PROVIDER_BASE_URLS = JSON.stringify({ openrouter: `${failing.baseUrl}/v1` });
	const harness = await startHarness({ upstreamBaseUrl: failing.baseUrl });
	const { app, base, tokenFor, createConversation } = harness;

	/** The POST of a run with the body the test names; the answer is a stream. */
	const post = (body: Record<string, unknown>, token = tokenFor(USER_A, WORKSPACE_A)): Promise<Response> =>
		fetch(`${base}/api/ai/runs`, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});

	/** A run to its end: the frames, and the id of the run. */
	const runToEnd = async (body: Record<string, unknown>): Promise<{ runId: string; events: SseEvent[] }> => {
		const runId = randomUUID();
		const conversationId = await createConversation();
		const response = await post({ runId, conversationId, text: 'hello', ...body });
		assert.equal(response.status, 200);
		return { runId, events: await collect(new SseStream(response)) };
	};

	/** What a subject holds today: spent and reserved. */
	const ledger = async (subject: string): Promise<{ spent: number; reserved: number }> => {
		const result = await app.db.query(
			'select reserved_microusd from public.ai_usage_daily where subject = $1 and day = current_date',
			[subject],
		);
		return { spent: await spentOf(app.db, subject), reserved: Number(result.rows[0]?.reserved_microusd ?? 0) };
	};

	/** The ledger of the user and of the platform, once nothing is reserved any more. */
	const settledLedger = async () => {
		for (let tries = 0; tries < 60; tries += 1) {
			const [user, platform] = [await ledger(USER_A), await ledger('platform')];
			if (user.reserved === 0 && platform.reserved === 0) return { user, platform };
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		return { user: await ledger(USER_A), platform: await ledger('platform') };
	};

	const runRow = async (runId: string) => {
		const result = await app.db.query(
			'select status, error, model, reserved_microusd, usage from public.ai_runs where id = $1',
			[runId],
		);
		return result.rows[0] as {
			status: string;
			error: string | null;
			model: string;
			reserved_microusd: string | number | null;
			usage: { attempts?: { model: string; kind: string; outcome: string; billed: number }[] } | null;
		};
	};

	/** A clean day: no ledger, no run, no script. */
	const clean = async (): Promise<void> => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		failing.reset();
		const rests = await app.redis.keys('ai:cooldown:*');
		if (rests.length > 0) await app.redis.del(...rests);
	};

	return { ...harness, failing, post, runToEnd, ledger, settledLedger, runRow, clean };
}

/** The types of the frames of a stream, in order. */
export const typesOf = (events: SseEvent[]): string[] => events.map((event) => event.event);

/** The last frame of a stream. */
export const lastOf = (events: SseEvent[]): SseEvent => events[events.length - 1];
