/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-not-found.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Devil C134-C136 (2026-10-22): a page the caller reaches only from outside its workspace
// answers every page-id route exactly as an id that does not exist: same status, same body,
// and on GET /api/pages/:id the same number of BaaS calls. A 403 there used to confirm that
// the page exists. A MEMBER lacking the route's permission is still told 403
// (bridge-membership-read.test.mjs).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, send, teamPage } from './support/bridge-harness.mjs';
import {
	ALL_PERMISSIONS, OTHER_PAGE, OUTSIDER, asB, asOutsider, inMembershipWorld, membershipWorld, removeMember,
} from './support/membership-world.mjs';

const PUBLIC = 'a5a5a5a5-1111-4111-8111-a5a5a5a5a5a5';
const COLLAB = 'a6a6a6a6-1111-4111-8111-a6a6a6a6a6a6';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** membershipWorld plus a public team page, a team page with the outsider as collaborator, and each caller's home workspace. */
function world() {
	const seeded = membershipWorld();
	// An id the seed already uses would read the seed's page instead and pass for the wrong reason.
	for (const id of [PUBLIC, COLLAB]) assert.ok(!seeded.osionos_pages.some((page) => page.id === id), `${id} is already seeded`);
	seeded.osionos_pages.push(
		teamPage(PUBLIC, IDS.userA, 'public', 'Launch post', 'public text'),
		{ ...teamPage(COLLAB, IDS.userA, 'private', 'For C', 'collaborator text'), collaborators: [{ userId: OUTSIDER.userId, role: 'editor' }] },
	);
	seeded.osionos_workspace_members.push(
		{ workspace_id: OUTSIDER.home, user_id: OUTSIDER.userId, role: 'owner', permissions: ALL_PERMISSIONS },
		{ workspace_id: IDS.homeB, user_id: IDS.userB, role: 'owner', permissions: ALL_PERMISSIONS },
	);
	return seeded;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

/** Every route keyed on a page id: [label, path(id), init(id)]. Translate shares config's gate and calls out, so it is left out. */
const ROUTES = [
	['GET /api/pages/:id', (id) => `/api/pages/${id}`, () => ({})],
	['PATCH /api/pages/:id', (id) => `/api/pages/${id}`, () => json('PATCH', { title: 'x' })],
	['DELETE /api/pages/:id', (id) => `/api/pages/${id}`, () => ({ method: 'DELETE' })],
	['POST /api/favorites', () => '/api/favorites', (id) => json('POST', { pageId: id })],
	['GET /api/pages/:id/config', (id) => `/api/pages/${id}/config`, () => ({})],
	['PATCH /api/pages/:id/config', (id) => `/api/pages/${id}/config`, () => json('PATCH', { config: { zoom: 2 } })],
	['POST /api/pages/:id/actions', (id) => `/api/pages/${id}/actions`, () => json('POST', { action: 'viewed', payload: {} })],
	['GET /api/marketplace/header-template', (id) => `/api/marketplace/header-template?databaseId=${id}`, () => ({})],
	['POST /api/marketplace/header-template', () => '/api/marketplace/header-template', (id) => json('POST', { databaseId: id, template: {} })],
];

/** Who asks for which page, and what happened first: none of them may read it as a member. */
const HIDDEN = [
	['a shared page, from outside its workspace', () => asOutsider(), IDS.sharedA],
	['the same, with a token that still lists the workspace', () => asOutsider([IDS.team]), IDS.sharedA],
	['a public page, from outside its workspace', () => asOutsider(), PUBLIC],
	['a page that lists the caller as collaborator, from outside its workspace', () => asOutsider(), COLLAB],
	['a shared page of another workspace', () => asB(), OTHER_PAGE],
	['a shared page, right after the caller was removed', () => asB(), IDS.sharedA, (mock) => removeMember(mock, IDS.team, IDS.userB)],
];

/** The answer with what legitimately differs between two requests (the id asked for, clocks, new row ids) masked. */
function shape(result, id) {
	const masked = JSON.parse(result.text.replaceAll(id, '<id>') || 'null', (key, value) => {
		if (typeof value === 'string' && ISO.test(value)) return '<ts>';
		return key === 'eventId' && value !== null ? '<event>' : value;
	});
	return { status: result.status, body: masked };
}

describe('a page outside the caller\'s workspaces answers like a missing id', () => {
	for (const [routeLabel, path, init] of ROUTES) {
		for (const [label, headers, pageId, before] of HIDDEN) {
			it(`${routeLabel}: ${label}`, async () => {
				await inMembershipWorld(world(), { realWorkspaceRpc: true }, async (base, mock) => {
					before?.(mock);
					const hidden = await send(base, path(pageId), headers(), init(pageId));
					const missing = await send(base, path(IDS.missing), headers(), init(IDS.missing));
					assert.notEqual(hidden.status, 403, hidden.text);
					assert.deepEqual(shape(hidden, pageId), shape(missing, IDS.missing));
				});
			});
		}
	}
});

describe('GET /api/pages/:id costs the same for a hidden page and a missing one', () => {
	for (const [label, headers, pageId, before] of HIDDEN) {
		it(label, async () => {
			await inMembershipWorld(world(), { realWorkspaceRpc: true }, async (base, mock) => {
				before?.(mock);
				const start = mock.calls.length;
				await send(base, `/api/pages/${pageId}`, headers());
				const hiddenCalls = mock.calls.length - start;
				await send(base, `/api/pages/${IDS.missing}`, headers());
				assert.equal(mock.calls.length - start - hiddenCalls, hiddenCalls);
			});
		});
	}
});
