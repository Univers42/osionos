/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-signin-parallel.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// For an email that is not an env admin, sign-in runs the identity upsert, the is_admin read and
// the member-workspace read together (devil-SC S2). The claims they mint are authorization on two
// routes, so the tests prove three things: the three calls really are in flight together, a failing
// branch never becomes an unhandled rejection (Node 22 exits on one), and a DB-recorded admin
// still gets today's tail.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_WORKSPACE_ID } from '../../scripts/bridge-api.mjs';
import { SUBJECT, PRIVATE_ID, createSigninStub, hashOf, signIn, workspaceRow } from './support/signin-world.mjs';

const OTHER_USER = 'f5e4f5e4-0000-4000-8000-0000000000f5';
const ROUND_ONE = new Set(['persist', 'get-admin', 'embed']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const adminWorkspace = () => workspaceRow(ADMIN_WORKSPACE_ID, OTHER_USER, 'Admin', '2026-10-02T00:00:00.000Z');
const dbAdmin = { provider: 'prismatica', subject: SUBJECT, email_hash: hashOf('owner@example.com'), is_admin: true, workspace_id: PRIVATE_ID };

describe('parallel sign-in', () => {
	it('puts the upsert, the is_admin read and the member read in flight together', async () => {
		let arrived = 0;
		let timedOut = 0;
		let open;
		const barrier = new Promise((resolve) => { open = resolve; });
		// Answers none of the three before all three have been asked. Sequential code asks one at a
		// time, so the first waits out its 400 ms and the barrier never opens before an answer.
		const hold = async (entry) => {
			if (!ROUND_ONE.has(entry.kind) || arrived >= 3) return;
			arrived += 1;
			if (arrived === 3) open();
			const winner = await Promise.race([barrier.then(() => 'open'), sleep(400).then(() => 'timeout')]);
			if (winner === 'timeout') timedOut += 1;
		};
		const stub = createSigninStub({}, { hold });
		await signIn(stub);
		assert.equal(timedOut, 0, 'three requests were in flight before any was answered');
		assert.deepEqual(new Set(stub.kinds()), ROUND_ONE);
		assert.equal(stub.log.length, 3, 'an ordinary sign-in makes no other call');
	});

	it('persist fails twice while the embed and is_admin reads reject → 503, no handoff, 0 unhandledRejection', async () => {
		let unhandled = 0;
		const count = () => { unhandled += 1; };
		process.on('unhandledRejection', count);
		try {
			const stub = createSigninStub({}, {
				// The reads fail late, persist fails at once: a persist awaited after them rejects unobserved.
				hold: async (entry) => { if (entry.kind !== 'persist') await sleep(30); },
				fail: (entry) => {
					if (entry.kind === 'persist') return new Response('cold', { status: 502 });
					throw new Error('link down');
				},
			});
			await assert.rejects(() => signIn(stub), (error) => error.status === 503 && /try again/.test(error.message));
			await sleep(100);
			assert.equal(unhandled, 0);
			assert.equal(stub.kinds().filter((kind) => kind === 'persist').length, 2, 'persist is retried once');
		} finally {
			process.off('unhandledRejection', count);
		}
	});

	it('DB-recorded admin with a viewer row in the admin workspace is re-upserted', async () => {
		const stub = createSigninStub({
			identities: [dbAdmin],
			osionos_workspaces: [workspaceRow(PRIVATE_ID, SUBJECT, 'Home', '2026-10-01T00:00:00.000Z'), adminWorkspace()],
			osionos_workspace_members: [
				{ workspace_id: PRIVATE_ID, user_id: SUBJECT, role: 'owner', permissions: ['read'] },
				{ workspace_id: ADMIN_WORKSPACE_ID, user_id: SUBJECT, role: 'viewer', permissions: ['read'] },
			],
		});
		const { claims, session } = await signIn(stub);
		assert.equal(claims.isAdmin, true);
		assert.equal(claims.roles[ADMIN_WORKSPACE_ID], 'admin');
		assert.deepEqual(session.sharedWorkspaces.map((workspace) => [workspace._id, workspace.role, workspace.permissions]), [[ADMIN_WORKSPACE_ID, 'admin', ['read', 'update', 'admin']]]);
		const kinds = stub.kinds();
		assert.deepEqual(kinds.slice(3), ['ensure', 'embed'], 'ensure, then the member read again');
		assert.equal(kinds.filter((kind) => kind === 'embed').length, 2, 'the first member read is discarded, not trusted');
	});

	it('a DB-recorded admin without an admin-workspace row gets it from the second member read', async () => {
		const stub = createSigninStub({ identities: [dbAdmin], osionos_workspaces: [workspaceRow(PRIVATE_ID, SUBJECT, 'Home', '2026-10-01T00:00:00.000Z'), adminWorkspace()] });
		const { claims } = await signIn(stub);
		assert.deepEqual(claims.raw.workspace_ids, [PRIVATE_ID, ADMIN_WORKSPACE_ID]);
	});
});
