/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-subject-case.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A user id reads the same in any letter case: the handoff entry point keeps
// one form so the session split and the token check agree with stored rows.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
	bridgeSignature,
	createUserSession,
	validateBridgePayload,
	verifyAppSessionToken,
	verifyBridgeRequest,
} from '../../scripts/bridge-api.mjs';
import {
	IDS,
	createPostgrestMock,
	harnessConfig,
	send,
	sessionHeaders,
	teamWorld,
	withBridge,
} from './support/bridge-harness.mjs';

const config = harnessConfig();
const SECRET = 'test-bridge-secret-that-is-long-enough';
const NOW = 1_768_000_000_000;
const LOWER = IDS.userA;
const UPPER = IDS.userA.toUpperCase();
const ALL = ['create', 'read', 'update', 'delete', 'admin'];

function upperPayload() {
	return { provider: 'prismatica', subject: UPPER, email: 'member@example.com', name: 'Member', jti: randomUUID() };
}

function lowerPayload() {
	return { provider: 'prismatica', subject: LOWER, email: 'member@example.com', name: 'Member', jti: randomUUID() };
}

describe('handoff and token keep one user-id form', () => {
	it('a handoff signed over an upper-case subject verifies and yields the lower-case subject', () => {
		const normalized = validateBridgePayload(upperPayload());
		const timestamp = String(NOW);
		const signature = bridgeSignature(SECRET, timestamp, normalized);
		const result = verifyBridgeRequest({
			headers: { 'x-prismatica-bridge-timestamp': timestamp, 'x-prismatica-bridge-signature': signature },
			payload: { provider: 'prismatica', subject: UPPER, email: 'member@example.com', name: 'Member', jti: normalized.jti },
			secret: SECRET,
			now: NOW,
			replayStore: new Map(),
		});
		assert.equal(result.subject, LOWER);
	});

	it("an upper-case subject's own team workspace is private in the session", () => {
		const session = createUserSession(validateBridgePayload(upperPayload()), config, null, NOW, [
			{ _id: IDS.team, ownerId: LOWER, role: 'owner', permissions: ALL },
		]);
		const privates = session.session.privateWorkspaces.map((entry) => entry._id);
		const shared = session.session.sharedWorkspaces.map((entry) => entry._id);
		assert.ok(privates.includes(IDS.team), 'the team workspace reads as owned');
		assert.equal(shared.includes(IDS.team), false);
	});

	it('a token minted with an upper-case subject verifies to the lower-case user id', () => {
		const at = Date.now();
		const session = createUserSession(validateBridgePayload(upperPayload()), config, {
			workspaceId: IDS.homeA, workspaceName: 'Home', workspaceSlug: 'home',
		}, at);
		const verified = verifyAppSessionToken(session.session.accessToken, config, at + 1000);
		assert.equal(verified.userId, LOWER);
	});
});

describe('stored rows keep matching the session user id', () => {
	it('a lower-case subject is unchanged', () => {
		const at = Date.now();
		const session = createUserSession(validateBridgePayload(lowerPayload()), config, {
			workspaceId: IDS.homeA, workspaceName: 'Home', workspaceSlug: 'home',
		}, at);
		const verified = verifyAppSessionToken(session.session.accessToken, config, at + 1000);
		assert.equal(verified.userId, LOWER);
	});

	it('the owner publishes their page with an upper-case token', async () => {
		const mock = createPostgrestMock(teamWorld());
		const previous = process.env.OSIONOS_PUBLISH_ENABLED;
		process.env.OSIONOS_PUBLISH_ENABLED = '1';
		try {
			await withBridge(config, mock.fetchImpl, async (base) => {
				const headers = sessionHeaders(config, UPPER, IDS.homeA);
				const published = await send(base, `/api/pages/${IDS.privateA}/publish`, headers, { method: 'POST' });
				assert.equal(published.status, 200, published.text);
			});
		} finally {
			if (previous === undefined) delete process.env.OSIONOS_PUBLISH_ENABLED;
			else process.env.OSIONOS_PUBLISH_ENABLED = previous;
		}
	});
});
