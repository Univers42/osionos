// The rows the identity flag implies are named once (bridge-admin-rights.mjs) and shared by the
// sign-in writers, the users console and the demotion (osionos#343). Each caller brings its own
// transport, so the primitives take a reader or a delete function, never a client of their own.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accessTicket, accessTicketWorkspace, ticketIsCurrent } from '../../scripts/bridge-access-generation.mjs';
import { ADMIN_WORKSPACE_ID, adminMembershipRows, deleteAdminMembership, grantRows, readRoleId } from '../../scripts/bridge-admin-rights.mjs';

const USER = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
const OTHER_WORKSPACE = 'ffffffff-6666-4666-8666-ffffffffffff';

describe('the admin-rights row primitives', () => {
	it('readRoleId answers the id of the named role, and null when the seeded row is missing', async () => {
		const paths = [];
		const reader = (rows) => ({ get: async (path) => (paths.push(path), rows) });
		assert.equal(await readRoleId(reader([{ id: 'role-1' }]), 'admin'), 'role-1');
		assert.equal(await readRoleId(reader([]), 'admin'), null);
		assert.equal(await readRoleId(reader({}), 'user'), null);
		assert.deepEqual(paths, ['roles?name=eq.admin&select=id&limit=1', 'roles?name=eq.admin&select=id&limit=1', 'roles?name=eq.user&select=id&limit=1']);
	});

	it('the grant and admin-membership filters name the user, the role and the admin workspace', () => {
		assert.equal(grantRows(USER, 'role-1'), `user_roles?user_id=eq.${USER}&role_id=eq.role-1`);
		assert.equal(adminMembershipRows(USER), `osionos_workspace_members?workspace_id=eq.${ADMIN_WORKSPACE_ID}&user_id=eq.${USER}`);
	});

	it('deleteAdminMembership deletes the admin membership and bumps the user and the workspace, even when the delete fails', async () => {
		const deleted = [];
		const tickets = () => [accessTicket(USER, OTHER_WORKSPACE), accessTicketWorkspace(ADMIN_WORKSPACE_ID)];
		let before = tickets();
		await deleteAdminMembership(async (path) => deleted.push(path), USER);
		assert.deepEqual(deleted, [adminMembershipRows(USER)]);
		assert.deepEqual(before.map(ticketIsCurrent), [false, false]);
		before = tickets();
		await assert.rejects(deleteAdminMembership(async () => { throw new Error('down'); }, USER), /down/);
		assert.deepEqual(before.map(ticketIsCurrent), [false, false]);
	});
});
