/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs-slate.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 13:50:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 13:50:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The signed slate of the recommender (devil C49).
 *
 * What the slate must hold:
 *   * it verifies for its own user, and for nobody else;
 *   * a changed signature or a changed payload is refused;
 *   * an hour later it is not a slate any more;
 *   * it is not a session token, and a session token is not a slate;
 *   * an empty secret signs nothing and verifies nothing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signAppSessionToken, verifyAppSessionToken } from '../../scripts/bridge-session-token.mjs';
import { signSlate, verifySlate } from '../../scripts/bridge-recs-slate.mjs';

const SECRET = 'the-app-session-secret';

describe('the signed slate', () => {
	const issuedAt = 1_700_000_000_000;
	const token = signSlate(SECRET, {
		recId: 'rec-1',
		userId: 'user-1',
		surface: 'home',
		items: ['page-1', 'page-2'],
		issuedAt,
	});

	it('verifies for its own user', () => {
		const verified = verifySlate(SECRET, token, 'user-1', issuedAt);
		assert.deepEqual(verified, { recId: 'rec-1', surface: 'home', items: ['page-1', 'page-2'] });
	});

	it('verifies for nobody else', () => {
		assert.equal(verifySlate(SECRET, token, 'user-2', issuedAt), null);
	});

	it('refuses a token whose signature was tampered with', () => {
		const [payload, signature] = token.split('.');
		const flipped = `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
		assert.equal(verifySlate(SECRET, flipped, 'user-1', issuedAt), null);
	});

	it('refuses a payload changed under its signature', () => {
		const [payload, signature] = token.split('.');
		const forged = Buffer.from(JSON.stringify({
			recId: 'rec-1', userId: 'user-1', surface: 'home', items: ['page-9'], issuedAt,
		}), 'utf8').toString('base64url');
		assert.notEqual(forged, payload);
		assert.equal(verifySlate(SECRET, `${forged}.${signature}`, 'user-1', issuedAt), null);
	});

	it('refuses to sign or verify under an empty secret', () => {
		// A key derived from '' is a key everybody has: a missing secret must
		// fail loudly, never seal a slate anyone can forge.
		const slate = { recId: 'r', userId: 'user-1', surface: 'home', items: [], issuedAt };
		for (const empty of ['', undefined, null, Buffer.alloc(0)]) {
			assert.throws(() => signSlate(empty, slate), /session secret/);
			assert.throws(() => verifySlate(empty, token, 'user-1', issuedAt), /session secret/);
		}
	});

	it('refuses a slate of an hour and one second ago', () => {
		assert.ok(verifySlate(SECRET, token, 'user-1', issuedAt + 3_600_000));
		assert.equal(verifySlate(SECRET, token, 'user-1', issuedAt + 3_601_000), null);
	});

	it('is not a session token, and a session token is not a slate', () => {
		const session = signAppSessionToken({
			payload: { subject: 'user-1', provider: 'test' },
			workspace: { _id: 'workspace-1' },
			config: { appSessionSecret: SECRET, sessionTtlSeconds: 3600 },
		}).token;
		assert.equal(verifySlate(SECRET, session, 'user-1', issuedAt), null);
		assert.throws(() => verifyAppSessionToken(token, { appSessionSecret: SECRET, sessionTtlSeconds: 3600 }));
	});
});
