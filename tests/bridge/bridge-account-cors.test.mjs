/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-cors.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The account plane answers each caller with its own allowed origin. The desktop app
 * (app://osionos) could not read Settings: the account modules wrote the bridge's default
 * origin on every reply, so the browser discarded them (2026-10-30, live bridge).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { send, sessionToken, startBridgeWorld, USER_A } from './support/account-world.mjs';

const ROUTES = ['/api/account/profile', '/api/account/settings', '/api/account/sessions'];

describe('account routes and the caller origin', () => {
	for (const origin of ['app://osionos', 'http://127.0.0.1:5173']) {
		for (const path of ROUTES) {
			it(`${path} answers ${origin} with its own origin`, async (t) => {
				const { base, config } = await startBridgeWorld(t);
				const reply = await send(base, path, { token: sessionToken(config, USER_A), headers: { origin } });
				assert.equal(reply.headers.get('access-control-allow-origin'), origin);
			});
		}
	}

	it('an unlisted origin still gets the configured one', async (t) => {
		const { base, config } = await startBridgeWorld(t);
		const reply = await send(base, '/api/account/profile', { token: sessionToken(config, USER_A), headers: { origin: 'https://evil.example' } });
		assert.equal(reply.headers.get('access-control-allow-origin'), config.allowedOrigin);
	});
});
