/* ************************************************************************** */
/*                                                                            */
/*   bridge-invite-connection-gate.test.mjs             :+:      :+:    :+:   */
/*                                                                            */
/* ************************************************************************** */

// C600–C607: the friendship gate is one block read + one edge read per gated call,
// flag-off is untouched, and every membership writer is pinned.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	ACCEPT_INVITE,
	INVITEE,
	JOIN_REQUEST,
	OWNER,
	fixtureWorld,
	blockRow,
	colleagueEdge,
	manualEdge,
	runScenario,
} from './support/invite-connection-harness.mjs';

const APP_ROOT = resolveRoot();
const ENV = { OSIONOS_INVITE_REQUIRES_CONNECTION: '1' };

function resolveRoot() {
	return join(dirname(fileURLToPath(import.meta.url)), '../..');
}

/** The pair_key the table stores: both ids lower-cased, sorted, joined by ':'. */
const pairKey = (a, b) => [String(a).toLowerCase(), String(b).toLowerCase()].sort((x, y) => x.localeCompare(y)).join(':');

/** A seeded connection edge (manualEdge/colleagueEdge carry no pair_key). */
function edge(row, a = OWNER, b = INVITEE) {
	return { ...row, pair_key: pairKey(a, b) };
}

/** fixtureWorld extended with the two tables this gate reads. */
function world({ connections = [], blocks = [], ...extra } = {}) {
	return fixtureWorld({ osionos_connections: connections, osionos_user_blocks: blocks, ...extra });
}

const inviteWrites = (result) => result.mock.calls.filter((call) => call.table === 'osionos_workspace_invites' && ['POST', 'PATCH'].includes(call.method));
const memberPosts = (result) => result.mock.calls.filter((call) => call.table === 'osionos_workspace_members' && call.method === 'POST');
const connectionWrites = (result) => result.mock.calls.filter((call) => call.table === 'osionos_connections' && call.method !== 'GET');
const bodyOf = (result) => JSON.parse(result.text);

describe('C600 a non-connected invitee', () => {
	it('C600 refuses invitePerson, createInviteForUser, inviteMember and resendInvite with 409 not_connected and no invite write', async () => {
		for (const name of ['invitePerson', 'createInviteForUser', 'inviteMember', 'resendInvite']) {
			const result = await runScenario(name, { env: ENV });
			assert.equal(result.status, 409, `${name}: ${result.text}`);
			assert.equal(bodyOf(result).code, 'not_connected', name);
			assert.equal(inviteWrites(result).length, 0, `${name} wrote an invite`);
		}
	});

	it('C600 lets the email invite through with a manual connection after one block read and one edge read', async () => {
		const result = await runScenario('invitePerson', { env: ENV, seed: world({ connections: [edge(manualEdge())] }) });
		assert.equal(result.status, 200, result.text);
		const reads = (table) => result.mock.calls.filter((call) => call.table === table && call.method === 'GET').length;
		assert.equal(reads('osionos_user_blocks'), 1);
		assert.equal(reads('osionos_connections'), 1);
	});

	it('C600 calls connectionStatus only at the five gated sites, with saveInviteForAccount owning invite creation', () => {
		const expected = new Map([
			['bridge-friendship.mjs', 1], // the definition
			['bridge-workspace-invites.mjs', 3], // saveInviteForAccount, resendInvite, acceptInvite
			['bridge-collab.mjs', 2], // joinCollaboration, decideJoinRequest
			['bridge-page-access-requests.mjs', 1], // create: block either way
			['bridge-page-access-request-decisions.mjs', 1], // decide: block either way
		]);
		const scripts = join(APP_ROOT, 'scripts');
		for (const file of readdirSync(scripts).filter((name) => name.endsWith('.mjs'))) {
			const source = readFileSync(join(scripts, file), 'utf8');
			const count = (source.match(/connectionStatus\(/g) ?? []).length;
			assert.equal(count, expected.get(file) ?? 0, `${file} connectionStatus call count`);
		}
		const invites = readFileSync(join(scripts, 'bridge-workspace-invites.mjs'), 'utf8');
		const saveBody = /\nasync function saveInviteForAccount\([\s\S]*?\n}/.exec(invites)?.[0] ?? '';
		assert.equal((saveBody.match(/connectionStatus\(/g) ?? []).length, 1, 'saveInviteForAccount must hold the only invite-creation call');
	});
});

describe('C601 connection source and direction', () => {
	it('C601 refuses a colleague-only edge', async () => {
		const result = await runScenario('invitePerson', { env: ENV, seed: world({ connections: [edge(colleagueEdge())] }) });
		assert.equal(result.status, 409, result.text);
		assert.equal(bodyOf(result).code, 'not_connected');
	});

	it('C601 accepts a manual edge in either direction but not a pending one', async () => {
		const forward = await runScenario('invitePerson', { env: ENV, seed: world({ connections: [edge(manualEdge())] }) });
		assert.equal(forward.status, 200, forward.text);

		const reverse = await runScenario('invitePerson', {
			env: ENV,
			seed: world({ connections: [edge(manualEdge(INVITEE, OWNER), INVITEE, OWNER)] }),
		});
		assert.equal(reverse.status, 200, reverse.text);

		const pending = await runScenario('invitePerson', {
			env: ENV,
			seed: world({ connections: [edge({ ...manualEdge(), status: 'pending' })] }),
		});
		assert.equal(pending.status, 409, pending.text);
		assert.equal(bodyOf(pending).code, 'not_connected');
	});
});

describe('C602 blocks', () => {
	const blockedWorld = (block) => world({ connections: [edge(manualEdge())], blocks: [block] });

	it('C602 answers a blocked email invite exactly like an unknown email', async () => {
		const reference = await runScenario('invitePerson', { env: ENV, users: [] });
		assert.equal(reference.status, 404, reference.text);

		for (const block of [blockRow(), blockRow(INVITEE, OWNER)]) {
			const result = await runScenario('invitePerson', { env: ENV, seed: blockedWorld(block) });
			assert.equal(result.status, reference.status);
			assert.deepEqual(bodyOf(result), bodyOf(reference));
		}
	});

	it('C602 answers a blocked id invite exactly like an unknown id', async () => {
		// The id route resolves the account first: an account with no usable email is its
		// no_account branch (a missing id is an upstream 502, a different answer).
		const reference = await runScenario('createInviteForUser', { env: ENV, users: [{ id: INVITEE, email: '' }] });
		assert.equal(reference.status, 404, reference.text);

		for (const block of [blockRow(), blockRow(INVITEE, OWNER)]) {
			const result = await runScenario('createInviteForUser', { env: ENV, seed: blockedWorld(block) });
			assert.equal(result.status, reference.status);
			assert.deepEqual(bodyOf(result), bodyOf(reference));
		}
	});

	it('C602 fails closed with 503 when the block read fails, writing nothing', async () => {
		const result = await runScenario('invitePerson', {
			env: ENV,
			seed: world({ connections: [edge(manualEdge())] }),
			failWhen: (call) => (call.table === 'osionos_user_blocks' ? { status: 500, body: { message: 'boom' } } : null),
		});
		assert.equal(result.status, 503, result.text);
		assert.equal(bodyOf(result).code, 'block_check_unavailable');
		assert.equal(inviteWrites(result).length, 0);
	});
});

describe('C603 what a refusal says', () => {
	it('C603 never puts a uuid in the email route not_connected body', async () => {
		const result = await runScenario('invitePerson', { env: ENV });
		assert.equal(result.status, 409, result.text);
		assert.doesNotMatch(result.text, /[0-9a-f]{8}-[0-9a-f]{4}-/i);
	});

	it('C603 carries profileUserId on the id route not_connected error', async () => {
		const result = await runScenario('createInviteForUser', { env: ENV });
		const body = bodyOf(result);
		assert.equal(result.status, 409, result.text);
		assert.equal(body.code, 'not_connected');
		assert.equal(body.profileUserId, INVITEE);
	});
});

describe('C604 accept re-checks only until accept', () => {
	it('C604 voids the invite on no edge, without writing a member or an edge', async () => {
		const result = await runScenario('acceptInvite', { env: ENV });
		assert.equal(result.status, 410, result.text);
		assert.equal(bodyOf(result).code, 'invite_used');

		const revoked = result.mock.calls.find((call) => call.table === 'osionos_workspace_invites'
			&& call.method === 'PATCH'
			&& call.params.get('id') === `eq.${ACCEPT_INVITE}`
			&& call.body && Object.hasOwn(call.body, 'revoked_at'));
		assert.ok(revoked, 'the invite was revoked with a filtered PATCH');
		assert.equal(memberPosts(result).length, 0, 'no member row was written');
		assert.equal(connectionWrites(result).length, 0, 'no colleague edge was written');
	});

	it('C604 accepts with a manual edge and writes the member row', async () => {
		const result = await runScenario('acceptInvite', { env: ENV, seed: world({ connections: [edge(manualEdge())] }) });
		assert.equal(result.status, 200, result.text);
		assert.equal(memberPosts(result).length, 1);
	});
});

describe('C605 every membership writer is pinned', () => {
	const SKIP_DIRS = new Set(['node_modules', '.git']);
	// Test and spike fixtures never run in the bridge; they are read but not counted.
	const NON_RUNTIME = /(^|\/)services\/[^/]+\/(tests|spikes)\//;
	const TEST_FILE = /\.test\.(mjs|ts)$/;

	function walk(dir, out = []) {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (SKIP_DIRS.has(entry.name)) continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path, out);
			else if (/\.(mjs|ts)$/.test(entry.name)) out.push(path);
		}
		return out;
	}

	const files = [
		...readdirSync(join(APP_ROOT, 'scripts')).filter((name) => name.endsWith('.mjs')).map((name) => join(APP_ROOT, 'scripts', name)),
		...walk(join(APP_ROOT, 'services')),
	];

	// A membership writer is a line naming the table where the same line is an
	// SQL `insert into` / PostgREST upsert (`on_conflict=`) / POST, or where the
	// next line carries `method: 'POST'` (the table name and its options span two lines).
	// Caveat: a URL or SQL assembled in a variable away from the table name is missed,
	// and test/spike fixtures are skipped because they never run in the bridge.
	const TABLE = /osionos_workspace_members/;
	const WRITE_MARKER = /method:\s*['"]POST['"]|insert\s+into\b|on_conflict=|\bupsert\b/i;

	function enclosingFunction(lines, index) {
		for (let i = index; i >= 0; i -= 1) {
			const match = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/.exec(lines[i])
				|| /^\s*(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/.exec(lines[i]);
			if (match) return match[1];
		}
		return '<module>';
	}

	function writerSites() {
		const sites = new Set();
		for (const file of files) {
			const rel = relative(APP_ROOT, file).split(sep).join('/');
			const source = readFileSync(file, 'utf8');
			if (TEST_FILE.test(rel) || NON_RUNTIME.test(rel)) continue;
			const lines = source.split('\n');
			for (let i = 0; i < lines.length; i += 1) {
				if (!TABLE.test(lines[i])) continue;
				const sameLine = WRITE_MARKER.test(lines[i]);
				const nextLine = /method:\s*['"]POST['"]/.test(lines[i + 1] ?? '');
				if (sameLine || nextLine) sites.add(`${rel}:${enclosingFunction(lines, i)}`);
			}
		}
		return [...sites].sort();
	}

	// Pinned by hand: changing this list is a review of who may write permanent membership.
	const PINNED = [
		'scripts/bridge-api.mjs:ensureAdminWorkspaceMembership', // exempt: env-admin provisioning; the admin claim is the gate
		'scripts/bridge-api.mjs:handleWorkspaceCreate', // exempt: workspace create writes the caller's own owner row
		'scripts/bridge-collab.mjs:addMember', // gated: joinCollaboration public and decideJoinRequest approve check first
		'scripts/bridge-workspace-invites.mjs:acceptInvite', // gated: invite accept re-checks the connection before the member POST
		'services/osionos-ai/eval/stack.ts:addMembers', // exempt: eval stack seeds a throwaway database
		'services/osionos-ai/eval/wiki/import.mjs:workspaceSql', // exempt: offline wiki import tool, not a request path
		'services/osionos-ai/load/seed.ts:<module>', // exempt: load-test seed script, not a request path
	];

	it('C605 has exactly the pinned set of membership writers', () => {
		assert.deepEqual(writerSites(), PINNED);
	});

	it('C605 lets a public join by a friend through and refuses a non-friend', async () => {
		const refused = await runScenario('joinCollaboration', { env: ENV });
		assert.equal(refused.status, 409, refused.text);
		assert.equal(bodyOf(refused).code, 'not_connected');
		assert.equal(memberPosts(refused).length, 0, 'no member row on refusal');

		const joined = await runScenario('joinCollaboration', { env: ENV, seed: world({ connections: [edge(manualEdge())] }) });
		assert.equal(joined.status, 200, joined.text);
		assert.equal(memberPosts(joined).length, 1, 'the friend joins with one member row');
	});

	it('C605 refuses an approval by a non-connected approver and leaves the request pending', async () => {
		const result = await runScenario('approveJoinRequest', { env: ENV });
		assert.equal(result.status, 409, result.text);
		assert.equal(bodyOf(result).code, 'not_connected');
		assert.equal(memberPosts(result).length, 0, 'no member row on refusal');
		const patched = result.mock.calls.filter((call) => call.table === 'osionos_join_requests'
			&& call.method === 'PATCH'
			&& call.params.get('id') === `eq.${JOIN_REQUEST}`);
		assert.equal(patched.length, 0, 'the join request stays pending');
	});
});

describe('C607 the legacy collab route', () => {
	it('C607 answers inviteMember with the same status and code as the id route', async () => {
		const idRoute = await runScenario('createInviteForUser', { env: ENV });
		const legacy = await runScenario('inviteMember', { env: ENV });
		assert.equal(legacy.status, idRoute.status, legacy.text);
		assert.equal(bodyOf(legacy).code, bodyOf(idRoute).code);
		assert.equal(legacy.status, 409);
	});
});
