/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   body.test.mjs                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// R1c review: a JSON body that is not an object (null, a number, a string, an array) used to
// reach `body.kind` and answer 500 with a TypeError; through the real server it is a 403.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);

describe('POST /api/realtime/token with a body that is not an object', () => {
	for (const body of ['null', '42', '"chat"', '[]', 'true']) {
		it(`refuses ${body} with a 403 that names no internals`, async () => {
			const mock = createPostgrestMock({});
			await withBridge(config, mock.fetchImpl, async (base) => {
				const res = await send(base, '/api/realtime/token', asB, { method: 'POST', body });
				assert.equal(res.status, 403, res.text);
				assert.doesNotMatch(res.text, /TypeError|Cannot read|undefined|null/);
			});
		});
	}
});
