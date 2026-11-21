import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CHAIN_FIRST_PART_BUDGET_MS, FIRST_PART_TIMEOUT_MS, createStreamClock, firstPartBudgetMs } from '../src/runs/streamClock.ts';

/** A scheduler the test drives by hand: no real second passes. */
function fakeTimers() {
	let time = 0;
	let nextId = 1;
	const pending = new Map<number, { at: number; fn: () => void }>();
	const timers = {
		now: () => time,
		setTimeout: (fn: () => void, ms: number) => {
			const id = nextId++;
			pending.set(id, { at: time + ms, fn });
			return id as unknown as ReturnType<typeof setTimeout>;
		},
		clearTimeout: (id: ReturnType<typeof setTimeout> | undefined) => {
			pending.delete(id as unknown as number);
		},
	};
	const advance = (ms: number) => {
		const end = time + ms;
		for (;;) {
			const due = [...pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
			if (!due) break;
			pending.delete(due[0]);
			time = due[1].at;
			due[1].fn();
		}
		time = end;
	};
	return { timers, advance };
}

function clockWith(firstPartMs = FIRST_PART_TIMEOUT_MS) {
	const fake = fakeTimers();
	let timedOut = false;
	const clock = createStreamClock({ onTimeout: () => { timedOut = true; }, firstPartMs, idleMs: 30_000, timers: fake.timers });
	return { fake, clock, timedOut: () => timedOut };
}

describe('the first-part clock (FA15-FA17)', () => {
	it('start-step then 60 s silence survives (FA15)', () => {
		const { fake, clock, timedOut } = clockWith();
		clock.onPart('start');
		clock.onPart('start-step');
		clock.onPart('raw');
		fake.advance(60_000);
		assert.equal(timedOut(), false);
		clock.stop();
	});

	it('90 s with no content part times out', () => {
		const { fake, clock, timedOut } = clockWith();
		clock.onPart('start-step');
		fake.advance(89_999);
		assert.equal(timedOut(), false);
		fake.advance(1);
		assert.equal(timedOut(), true);
	});

	it('idle 30 s after the first text times out', () => {
		const { fake, clock, timedOut } = clockWith();
		fake.advance(80_000);
		clock.onPart('text-delta');
		fake.advance(29_999);
		assert.equal(timedOut(), false);
		fake.advance(1);
		assert.equal(timedOut(), true);
	});

	it('re-arms after a tool step: 45 s of silence after the second start-step survives (FA16)', () => {
		const { fake, clock, timedOut } = clockWith();
		clock.onPart('start-step');
		clock.onPart('tool-call');
		clock.onPart('tool-result');
		clock.onPart('finish-step');
		fake.advance(20_000);
		clock.onPart('start-step');
		fake.advance(45_000);
		assert.equal(timedOut(), false);
		fake.advance(45_000);
		assert.equal(timedOut(), true);
	});

	it('a tool-input-start and a reasoning-delta count as content', () => {
		for (const type of ['tool-input-start', 'reasoning-delta']) {
			const { fake, clock, timedOut } = clockWith();
			clock.onPart(type);
			fake.advance(30_000);
			assert.equal(timedOut(), true, type);
		}
	});

	it('chain budget: 3 stalled targets end by 150 s (FA17)', () => {
		const fake = fakeTimers();
		const startedAt = fake.timers.now();
		const waits: number[] = [];
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const budget = firstPartBudgetMs(startedAt, fake.timers.now());
			let timedOut = false;
			createStreamClock({ onTimeout: () => { timedOut = true; }, firstPartMs: budget, idleMs: 30_000, timers: fake.timers });
			fake.advance(budget);
			assert.equal(timedOut, true);
			waits.push(budget);
		}
		assert.deepEqual(waits, [90_000, 60_000, 0]);
		assert.equal(fake.timers.now() - startedAt, CHAIN_FIRST_PART_BUDGET_MS);
	});

	it('the budget never exceeds the window and never goes below zero', () => {
		assert.equal(firstPartBudgetMs(0, 0), FIRST_PART_TIMEOUT_MS);
		assert.equal(firstPartBudgetMs(0, 100_000), 50_000);
		assert.equal(firstPartBudgetMs(0, 400_000), 0);
	});
});
