import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	DEFAULT_HOLD,
	DEFAULT_MODEL,
	DEFAULT_REVISION,
	computePolicyHash,
	resolvePolicy,
} from '../src/moderation/policy.ts';

/** The policy of the L1 worker: pure functions of the environment (C85). */

const URL = 'http://tei-toxicity:80';
const base = { OSIONOS_MODERATION_L1_URL: URL };
const defaultHash = computePolicyHash({ model: DEFAULT_MODEL, revision: DEFAULT_REVISION, hold: DEFAULT_HOLD });

describe('the moderation policy', () => {
	it('hashes {model, revision, hold} stably, and a change of any of them changes it', () => {
		const a = computePolicyHash({ model: 'm', revision: 'r', hold: 0.9 });
		assert.match(a, /^[0-9a-f]{64}$/);
		assert.equal(a, computePolicyHash({ model: 'm', revision: 'r', hold: 0.9 }));
		assert.notEqual(a, computePolicyHash({ model: 'm2', revision: 'r', hold: 0.9 }));
		assert.notEqual(a, computePolicyHash({ model: 'm', revision: 'r2', hold: 0.9 }));
		assert.notEqual(a, computePolicyHash({ model: 'm', revision: 'r', hold: 0.8 }));
	});

	it('defaults to log, the pinned model and the 0.9 threshold', () => {
		const policy = resolvePolicy({ ...base });
		assert.equal(policy.configured, 'log');
		assert.equal(policy.mode, 'log');
		assert.equal(policy.model, DEFAULT_MODEL);
		assert.equal(policy.revision, DEFAULT_REVISION);
		assert.equal(policy.hold, 0.9);
		assert.equal(policy.policyHash, defaultHash);
	});

	it('off runs no worker and needs no URL', () => {
		const policy = resolvePolicy({ OSIONOS_MODERATION_ACTIONS: 'off' });
		assert.equal(policy.mode, 'off');
		assert.equal(policy.runsWorker, false);
	});

	it('log runs a worker whose mode is log', () => {
		const policy = resolvePolicy({ ...base, OSIONOS_MODERATION_ACTIONS: 'log' });
		assert.equal(policy.runsWorker, true);
		assert.equal(policy.mode, 'log');
	});

	it('hold needs the calibrated hash of the policy to hold', () => {
		const calibrated = resolvePolicy({
			...base,
			OSIONOS_MODERATION_ACTIONS: 'hold',
			OSIONOS_MODERATION_CALIBRATED_POLICY: defaultHash,
		});
		assert.equal(calibrated.mode, 'hold');
		assert.equal(calibrated.calibrated, true);
	});

	it('on is treated as hold: auto-remove is refused (C83)', () => {
		const policy = resolvePolicy({
			...base,
			OSIONOS_MODERATION_ACTIONS: 'on',
			OSIONOS_MODERATION_CALIBRATED_POLICY: defaultHash,
		});
		assert.equal(policy.configured, 'on');
		assert.equal(policy.mode, 'hold');
		assert.equal(policy.removeRefused, true);
	});

	it('a hash that is not the calibrated one drops to log (C85)', () => {
		const changedThreshold = resolvePolicy({
			...base,
			OSIONOS_MODERATION_ACTIONS: 'hold',
			OSIONOS_MODERATION_L1_HOLD: '0.8',
			OSIONOS_MODERATION_CALIBRATED_POLICY: defaultHash,
		});
		assert.equal(changedThreshold.mode, 'log');
		assert.equal(changedThreshold.calibrated, false);
		const notCalibratedAtAll = resolvePolicy({ ...base, OSIONOS_MODERATION_ACTIONS: 'hold' });
		assert.equal(notCalibratedAtAll.mode, 'log');
	});

	it('refuses a bad mode, a missing URL and a threshold outside (0, 1]', () => {
		assert.throws(() => resolvePolicy({ ...base, OSIONOS_MODERATION_ACTIONS: 'remove' }), /OSIONOS_MODERATION_ACTIONS/);
		assert.throws(() => resolvePolicy({ OSIONOS_MODERATION_ACTIONS: 'log' }), /OSIONOS_MODERATION_L1_URL/);
		assert.throws(() => resolvePolicy({ ...base, OSIONOS_MODERATION_L1_HOLD: '1.5' }), /OSIONOS_MODERATION_L1_HOLD/);
		assert.throws(() => resolvePolicy({ ...base, OSIONOS_MODERATION_L1_HOLD: '0' }), /OSIONOS_MODERATION_L1_HOLD/);
	});
});
