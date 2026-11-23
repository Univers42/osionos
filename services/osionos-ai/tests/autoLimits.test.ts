import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { startHarness, USER_A, WORKSPACE_A } from './harness.ts';

/**
 * Auto mode's own caps (AM5, AM6): a rate bucket apart from the runs', a cap
 * per turn, per UTC day and per step.
 */
const { app, mock, bridge } = await startHarness();
const { config } = await import('../src/config.ts');
const { checkRunRateLimit } = await import('../src/rateLimit.ts');
const { checkAutoWriteRate, takeDailyAuto, countAutoInTurn, makeStepCounter, AUTO_WRITE_LIMIT_PREFIX } =
	await import('../src/modes/autoLimits.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

describe('the auto write bucket (AM5)', () => {
	it('25 auto writes leave the run bucket untouched', async () => {
		const user = randomUUID();
		for (let i = 0; i < 25; i += 1) {
			assert.equal((await checkAutoWriteRate(app.redis, user)).allowed, true, `write ${i + 1}`);
		}
		assert.equal((await checkRunRateLimit(app.redis, user, config.runsPerMinute)).allowed, true);
	});

	it('the write past autoPerMinute is refused', async () => {
		const user = randomUUID();
		const now = new Date('2026-11-23T10:00:05Z');
		for (let i = 0; i < config.autoPerMinute; i += 1) await checkAutoWriteRate(app.redis, user, now);
		assert.equal((await checkAutoWriteRate(app.redis, user, now)).allowed, false);
		assert.equal(AUTO_WRITE_LIMIT_PREFIX, 'ai:rl:auto');
	});

	it.todo('Task 15: 25 auto writes through the harness, then POST /runs gives 200');
});

describe('the daily cap (AM6)', () => {
	it('the 201st auto write of a UTC day is refused, the next day starts fresh', async () => {
		const user = randomUUID();
		const now = new Date('2026-11-23T10:00:00Z');
		// One write short of the cap, preset: 200 round trips prove nothing more.
		await app.redis.set(`ai:rl:auto:day:${user}:20261123`, String(config.autoPerDay - 1));
		assert.equal((await takeDailyAuto(app.redis, user, now)).allowed, true);
		assert.equal((await takeDailyAuto(app.redis, user, now)).allowed, false);
		assert.equal((await takeDailyAuto(app.redis, user, new Date('2026-11-24T00:00:01Z'))).allowed, true);
		assert.ok((await app.redis.ttl(`ai:rl:auto:day:${user}:20261123`)) > 0);
	});
});

describe('the turn cap (AM6)', () => {
	async function seedRun(turn: string, decidedBy: Array<string | null>): Promise<void> {
		const conversation = randomUUID();
		const run = randomUUID();
		await app.db.query(
			"insert into public.ai_conversations (id, owner_id, workspace_id, title) values ($1, $2, $3, 'c')",
			[conversation, USER_A, WORKSPACE_A],
		);
		await app.db.query(
			`insert into public.ai_runs (id, conversation_id, owner_id, status, model, reserved_microusd, created_at, turn_id)
			 values ($1, $2, $3, 'running', 'm', 0, now(), $4)`,
			[run, conversation, USER_A, turn],
		);
		for (const by of decidedBy) {
			await app.db.query(
				`insert into public.ai_approvals
				   (id, run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, expires_at, decided_by)
				 values ($1, $2, $3, $4, $5, 'create_page', '{}'::jsonb, $6, 'executed', now() + interval '10 minutes', $7)`,
				[randomUUID(), run, conversation, USER_A, WORKSPACE_A, randomUUID(), by],
			);
		}
	}

	it('counts auto approvals over a parent run and its decided continuation only', async () => {
		const turn = randomUUID();
		await seedRun(turn, ['auto:auto', 'user']);
		await seedRun(turn, ['auto:accept_edits', 'auto:auto', null]);
		await seedRun(randomUUID(), ['auto:auto']);
		assert.equal(await countAutoInTurn(app.db, turn), 3);
		assert.equal(await countAutoInTurn(app.db, randomUUID()), 0);
	});
});

describe('the step counter (AM6)', () => {
	it('is false after the limit and true again after reset', () => {
		const steps = makeStepCounter(config.autoPerStep);
		for (let i = 0; i < config.autoPerStep; i += 1) assert.equal(steps.take(), true);
		assert.equal(steps.take(), false);
		steps.reset();
		assert.equal(steps.take(), true);
	});
});
