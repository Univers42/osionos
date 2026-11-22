import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { modesAllowed, parseModesConfig } from '../src/modes/modesConfig.ts';
import { USER_A, USER_B } from './harness.ts';

/**
 * The modes flag, the per-user allowlist and the auto caps (AM18, G7). The
 * compose test reads the groot file mounted at /groot by scripts/test.sh.
 */
const COMPOSE_PUBLIC = process.env.OSIONOS_AI_GROOT_COMPOSE_PUBLIC ?? '/groot/docker-compose.public.yml';

describe('parseModesConfig', () => {
	it('is off, empty and defaulted for an empty environment', () => {
		const cfg = parseModesConfig({});
		assert.equal(cfg.modesEnabled, false);
		assert.equal(cfg.modesUsers.size, 0);
		assert.equal(modesAllowed(cfg, USER_A), false);
		assert.deepEqual([cfg.autoPerTurn, cfg.autoPerDay, cfg.autoPerMinute, cfg.autoPerStep], [25, 200, 30, 10]);
	});

	it('allows the listed users when on, trimming spaces', () => {
		const cfg = parseModesConfig({ OSIONOS_AI_MODES: 'on', OSIONOS_AI_MODES_USERS: ` ${USER_A} , ${USER_B} ` });
		assert.equal(modesAllowed(cfg, USER_A), true);
		assert.equal(modesAllowed(cfg, USER_B), true);
		assert.equal(modesAllowed(cfg, '00000000-0000-4000-8000-000000000000'), false);
	});

	it('throws at parse for a malformed uuid in the list', () => {
		assert.throws(
			() => parseModesConfig({ OSIONOS_AI_MODES: 'on', OSIONOS_AI_MODES_USERS: `${USER_A},bad` }),
			/OSIONOS_AI_MODES_USERS: "bad" is not a uuid/,
		);
	});

	it('allows nobody when on with an empty list, or off with a list', () => {
		assert.equal(modesAllowed(parseModesConfig({ OSIONOS_AI_MODES: 'on', OSIONOS_AI_MODES_USERS: '' }), USER_A), false);
		assert.equal(modesAllowed(parseModesConfig({ OSIONOS_AI_MODES: 'off', OSIONOS_AI_MODES_USERS: USER_A }), USER_A), false);
		assert.equal(modesAllowed(parseModesConfig({ OSIONOS_AI_MODES: 'ON', OSIONOS_AI_MODES_USERS: USER_A }), USER_A), false);
	});

	it('reads the caps and throws when one is out of range', () => {
		const cfg = parseModesConfig({ OSIONOS_AI_AUTO_PER_TURN: '100', OSIONOS_AI_AUTO_PER_DAY: '5' });
		assert.equal(cfg.autoPerTurn, 100);
		assert.equal(cfg.autoPerDay, 5);
		for (const value of ['0', '101', '2.5', 'x']) {
			assert.throws(
				() => parseModesConfig({ OSIONOS_AI_AUTO_PER_TURN: value }),
				/OSIONOS_AI_AUTO_PER_TURN must be an integer from 1 to 100/,
			);
		}
		assert.throws(() => parseModesConfig({ OSIONOS_AI_AUTO_PER_DAY: '0' }), /OSIONOS_AI_AUTO_PER_DAY must be an integer from 1 to/);
	});
});

describe('docker-compose.public.yml', () => {
	it('pins both modes keys to an empty string', () => {
		const text = readFileSync(COMPOSE_PUBLIC, 'utf8');
		assert.match(text, /^\s+OSIONOS_AI_MODES: ""\s*$/m);
		assert.match(text, /^\s+OSIONOS_AI_MODES_USERS: ""\s*$/m);
	});
});
