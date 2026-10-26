import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { USER_A, WORKSPACE_A } from './harness.ts';
import { startKit, typesOf, lastOf } from './failoverKit.ts';
import { SseStream, collect } from './sse.ts';

/**
 * The money and the rotation of a run that falls back to its next model.
 *
 * Prices (micro-USD for the mock's 1000 tokens in, 500 out): mock-metered
 * 30, mock-vision 1 500, mock-platform 10 500. A 429 or a 5xx reports no
 * usage, so a failed attempt books 0.
 */
const kit = await startKit();
const { app, failing, bridge, mock, runToEnd, ledger, settledLedger, runRow, clean, tokenFor } = kit;
const { sweepStaleRuns } = await import('../src/runs/runner.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});

const PLATFORM_COST = 10_500;
const VISION_COST = 1_500;

/** Waits until the scripted upstream has seen `count` requests. */
async function untilRequests(count: number): Promise<void> {
	for (let tries = 0; tries < 200 && failing.requests.length < count; tries += 1) {
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	assert.ok(failing.requests.length >= count, 'the upstream never saw the request');
}

/** A reservation another run holds, so a double release shows. */
async function seedReserved(user: number, platform: number): Promise<void> {
	for (const [subject, reserved] of [[USER_A, user], ['platform', platform]] as const) {
		await app.db.query(
			`insert into public.ai_usage_daily (subject, day, spent_microusd, reserved_microusd)
			 values ($1, current_date, 0, $2)
			 on conflict (subject, day) do update set spent_microusd = 0, reserved_microusd = $2`,
			[subject, reserved],
		);
	}
}

describe('a run falls back to the next model', () => {
	before(clean);

	it('C245 C260 C261 a 429 then a fallback success books the fallback only', async () => {
		await clean();
		failing.script('mock-metered', 429);
		const { runId, events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-platform' }] });
		assert.equal(lastOf(events).event, 'done');
		const route = events.filter((event) => event.event === 'route');
		assert.deepEqual(route.map((event) => event.data), [
			{ from: 'mock-metered', to: 'mock-platform', reason: 'rate_limited' },
		]);
		assert.deepEqual(failing.requests, ['mock-metered', 'mock-platform']);
		const { user, platform } = await settledLedger();
		assert.deepEqual(user, { spent: PLATFORM_COST, reserved: 0 });
		assert.deepEqual(platform, { spent: PLATFORM_COST, reserved: 0 });
		const row = await runRow(runId);
		assert.equal(row.model, 'mock-platform');
		assert.deepEqual(row.usage?.attempts, [
			{ model: 'mock-metered', kind: 'platform', outcome: 'rate_limited', billed: 0 },
			{ model: 'mock-platform', kind: 'platform', outcome: 'succeeded', billed: PLATFORM_COST },
		]);
	});

	it('C244 C251 a 500, a second 500, then a third model that answers', async () => {
		await clean();
		failing.script('mock-metered', 500);
		failing.script('mock-vision', 500);
		const { runId, events } = await runToEnd({
			model: 'mock-metered',
			fallbacks: [{ model: 'mock-vision' }, { model: 'mock-platform' }],
		});
		assert.equal(lastOf(events).event, 'done');
		assert.deepEqual(events.filter((event) => event.event === 'route').map((event) => event.data), [
			{ from: 'mock-metered', to: 'mock-vision', reason: 'upstream_error' },
			{ from: 'mock-vision', to: 'mock-platform', reason: 'upstream_error' },
		]);
		assert.deepEqual(failing.requests, ['mock-metered', 'mock-vision', 'mock-platform']);
		const { user, platform } = await settledLedger();
		assert.deepEqual(user, { spent: PLATFORM_COST, reserved: 0 });
		assert.deepEqual(platform, { spent: PLATFORM_COST, reserved: 0 });
		assert.equal((await runRow(runId)).usage?.attempts?.length, 3);
	});

	it('C245 a connection that resets before the first byte is booked at the estimate', async () => {
		await clean();
		failing.script('mock-metered', 'reset');
		const { runId, events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] });
		assert.equal(lastOf(events).event, 'done');
		const attempts = (await runRow(runId)).usage?.attempts ?? [];
		assert.equal(attempts[0].outcome, 'unavailable');
		assert.ok(attempts[0].billed > 0, 'the estimate of the prompt is booked');
		const { user, platform } = await settledLedger();
		assert.equal(user.spent, attempts[0].billed + VISION_COST);
		assert.deepEqual(platform, user);
	});

	it('C247 a fallback the day cannot pay for ends budget_exhausted with the primary money back', async () => {
		await clean();
		failing.script('mock-metered', 503);
		const { runId, events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-dear' }] });
		const end = lastOf(events);
		assert.equal(end.event, 'error');
		assert.equal((end.data as { code: string }).code, 'budget_exhausted');
		assert.equal(failing.countFor('mock-dear'), 0);
		const { user, platform } = await settledLedger();
		assert.deepEqual(user, { spent: 0, reserved: 0 });
		assert.deepEqual(platform, { spent: 0, reserved: 0 });
		const row = await runRow(runId);
		assert.equal(row.status, 'failed');
		assert.equal(row.error, 'budget_exhausted');
		assert.equal(row.usage?.attempts?.[0].outcome, 'upstream_error');
	});

	it('C241 C246 a crash between settle and reserve leaves the ledger exact', async () => {
		await clean();
		await seedReserved(7_000, 9_000);
		failing.script('mock-metered', { behaviour: 503, delayMs: 400 });
		await app.db.query(`create or replace function public.ai_test_crash() returns trigger language plpgsql as
			$$ begin raise exception 'injected crash after the settle'; end $$`);
		try {
			const running = runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-platform' }] });
			await untilRequests(1);
			// Armed while the primary holds its reservation: the next RAISE of
			// a reservation is the fallback's.
			await app.db.query(`create trigger ai_test_crash before update on public.ai_usage_daily
				for each row when (new.reserved_microusd > old.reserved_microusd) execute function public.ai_test_crash()`);
			const { events } = await running;
			assert.equal(lastOf(events).event, 'error');
			assert.equal(failing.countFor('mock-platform'), 0);
		} finally {
			await app.db.query('drop trigger if exists ai_test_crash on public.ai_usage_daily');
		}
		const { user, platform } = await settledLedger();
		// Exactly the baseline: the settle of the primary rolled back with the
		// reserve, and the run released its reservation once.
		assert.deepEqual(user, { spent: 0, reserved: 7_000 });
		assert.deepEqual(platform, { spent: 0, reserved: 9_000 });
	});

	it('C242 a run the sweep already closed is not settled again', async () => {
		await clean();
		await seedReserved(7_000, 9_000);
		failing.script('mock-metered', { behaviour: 503, delayMs: 500 });
		const running = runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-platform' }] });
		await untilRequests(1);
		assert.equal((await sweepStaleRuns(app.db, 0)).length, 1);
		const { runId, events } = await running;
		assert.equal(lastOf(events).event, 'error');
		assert.equal(failing.countFor('mock-platform'), 0);
		assert.equal((await runRow(runId)).error, 'timeout');
		const { user, platform } = await settledLedger();
		assert.deepEqual(user, { spent: 0, reserved: 7_000 });
		assert.deepEqual(platform, { spent: 0, reserved: 9_000 });
	});

	it('C243 twenty runs that fail over at once leave the ledger exact', async () => {
		await clean();
		failing.always('mock-metered', 503);
		const runs = await Promise.all(
			Array.from({ length: 20 }, () => runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] })),
		);
		assert.ok(runs.every((run) => lastOf(run.events).event === 'done'));
		const billed = (await Promise.all(runs.map((run) => kit.runRow(run.runId))))
			.flatMap((row) => row.usage?.attempts ?? [])
			.reduce((sum, attempt) => sum + attempt.billed, 0);
		assert.equal(billed, 20 * VISION_COST);
		const { user, platform } = await settledLedger();
		assert.deepEqual(user, { spent: billed, reserved: 0 });
		assert.deepEqual(platform, { spent: billed, reserved: 0 });
	});

	it('C246 the row holds the reservation of the model that answers, and only that one', async () => {
		await clean();
		failing.script('mock-metered', 503);
		failing.script('mock-vision', { behaviour: 'ok', delayMs: 700 });
		const running = runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] });
		await untilRequests(2);
		const mid = await app.db.query(
			`select model, reserved_microusd from public.ai_runs where status = 'running'`,
		);
		assert.equal(mid.rows[0].model, 'mock-vision');
		const held = Number(mid.rows[0].reserved_microusd);
		assert.ok(held > 0);
		assert.equal((await ledger(USER_A)).reserved, held);
		assert.equal((await ledger('platform')).reserved, held);
		await running;
		assert.equal((await settledLedger()).user.reserved, 0);
	});

	it('C260 a client that reconnects replays the route frame before the next answer', async () => {
		await clean();
		failing.script('mock-metered', 429);
		const { runId, events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] });
		const again = await fetch(`${kit.base}/api/ai/runs/${runId}/events`, {
			headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}` },
		});
		const replayed = await collect(new SseStream(again));
		assert.deepEqual(typesOf(replayed), typesOf(events));
		assert.ok(typesOf(replayed).indexOf('route') < typesOf(replayed).indexOf('text.delta'));
	});

	it('C262 a run without fallbacks keeps its retries, its row and its ledger', async () => {
		await clean();
		const ok = await runToEnd({ model: 'mock-metered', fallbacks: [] });
		assert.equal(lastOf(ok.events).event, 'done');
		assert.equal((await runRow(ok.runId)).usage?.attempts, undefined);
		assert.deepEqual((await settledLedger()).user, { spent: 30, reserved: 0 });
		failing.always('mock-metered', 503);
		const down = await runToEnd({ model: 'mock-metered' });
		assert.deepEqual(typesOf(down.events).filter((type) => type !== 'run.started'), ['error']);
		assert.equal((down.events.at(-1)?.data as { code: string }).code, 'upstream_error');
		// The SDK's default of two retries: three requests, as before failover.
		assert.equal(failing.countFor('mock-metered'), 1 + 3);
		assert.equal((await runRow(down.runId)).usage?.attempts, undefined);
	});
});
