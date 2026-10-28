/* ************************************************************************** */
/*                                                                            */
/*   bridge-invite-connection-baseline.test.mjs         :+:      :+:    :+:   */
/*                                                                            */
/* ************************************************************************** */

// C606: values other than exactly '1' retain the pre-F1 PostgREST sequence and HTTP bytes.
// Dynamic tokens, generated invite ids and timestamps have fixed placeholders in the recording.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recordBaseline } from './support/invite-connection-harness.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/invite-connection-baseline.json', import.meta.url), 'utf8'));

describe('C606 flag-off call-sequence fixture', () => {
	for (const [label, env] of [
		['unset', {}],
		["the string 'true'", { OSIONOS_INVITE_REQUIRES_CONNECTION: 'true' }],
		["the string '0'", { OSIONOS_INVITE_REQUIRES_CONNECTION: '0' }],
		['empty', { OSIONOS_INVITE_REQUIRES_CONNECTION: '' }],
	]) {
		it(`is byte-identical to the pre-change recording with the flag ${label}`, async () => {
			const actual = await recordBaseline(env);
			assert.equal(JSON.stringify(actual), JSON.stringify(fixture));
		});
	}
});
