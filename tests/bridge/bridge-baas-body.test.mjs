/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-baas-body.test.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A 200 whose body stops mid-array must answer 502, never 200 with a short list:
// the client cannot tell a short list from a workspace with no pages, so the
// broken read has to surface as the failed read it is.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asTeamOwner = sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team]);
const asEditor = sessionHeaders(config, IDS.userB, IDS.homeB);

// Fixed-width hex so the id order of the seed is the same raw string order the
// bridge, the cursor filter and Postgres all compare on.
const uuidFor = (index) => `f0000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;

function seedPage(index, overrides = {}) {
	const id = uuidFor(index);
	return {
		id,
		workspace_id: IDS.team,
		owner_id: IDS.userA,
		visibility: 'private',
		title: `Page ${index}`,
		collaborators: [],
		properties: [],
		parent_page_id: null,
		archived_at: null,
		content: [{ id: `${id}-b1`, type: 'paragraph', content: `body ${index}` }],
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
		...overrides,
		id,
	};
}

/** The team members a workspace-gated page read needs, with `pages` as the workspace's rows. */
function worldOf(pages) {
	const world = teamWorld();
	world.osionos_pages = pages;
	return world;
}

function cutResponse() {
	return new Response(new ReadableStream({
		start(c) {
			c.enqueue(new TextEncoder().encode('[{"id":'));
			c.error(new Error('terminated'));
		},
	}), { status: 200, headers: { 'content-type': 'application/json' } });
}

function garbledResponse() {
	return new Response('[{"id":"x"', { status: 200, headers: { 'content-type': 'application/json' } });
}

const brokenResponse = (mode) => (mode === 'cut' ? cutResponse() : garbledResponse());

// Ponytail: the wrapper tells chunks apart by the keyset cursor param (a first
// chunk never carries one), so a future filter that adds `id` elsewhere would
// misroute that read toward 502, never toward a silent short list.
function breakTable(mock, table, mode, { onlyCursorChunk = false } = {}) {
	const inner = mock.fetchImpl;
	const fetchImpl = async (url, init = {}) => {
		const target = String(url);
		if ((init.method ?? 'GET') === 'GET' && target.includes(`/rest/v1/${table}?`)) {
			const isLaterChunk = new URL(target).searchParams.get('id')?.startsWith('gt.') ?? false;
			if (!onlyCursorChunk || isLaterChunk) return brokenResponse(mode);
		}
		return inner(url, init);
	};
	return { ...mock, fetchImpl };
}

describe('a cut or garbled BaaS body is an error, never an empty list', () => {
	it('answers 502, never an empty list, when the page-table body stops mid-array', async () => {
		const mock = breakTable(createPostgrestMock(worldOf([seedPage(0)])), 'osionos_pages', 'cut');
		await withBridge(config, mock.fetchImpl, async (base) => {
			const listed = await send(base, `/api/pages/all?workspaceId=${IDS.team}`, asTeamOwner);
			assert.equal(listed.status, 502, listed.text);
			assert.equal(Array.isArray(listed.body), false);
		});
	});

	it('answers 502 when the page-table body is not valid JSON', async () => {
		const mock = breakTable(createPostgrestMock(worldOf([seedPage(0)])), 'osionos_pages', 'garbled');
		await withBridge(config, mock.fetchImpl, async (base) => {
			const listed = await send(base, `/api/pages/all?workspaceId=${IDS.team}`, asTeamOwner);
			assert.equal(listed.status, 502, listed.text);
			assert.equal(Array.isArray(listed.body), false);
		});
	});

	it('answers 502, never a partial list, when a later chunk body stops mid-array', async () => {
		const pages = Array.from({ length: 250 }, (unused, index) => seedPage(index));
		const mock = breakTable(createPostgrestMock(worldOf(pages)), 'osionos_pages', 'cut', { onlyCursorChunk: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const listed = await send(base, `/api/pages?workspaceId=${IDS.team}`, asTeamOwner);
			assert.equal(listed.status, 502, listed.text);
			assert.equal(Array.isArray(listed.body), false);
		});
	});

	it('still answers a write whose PostgREST answer carries no body', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'editor' }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const saved = await send(base, `/api/pages/${IDS.sharedA}`, asEditor, patch({ title: 'Edited title' }));
			assert.equal(saved.status, 200, saved.text);
			assert.notEqual(saved.status, 502);
		});
	});

	it('answers 502 when a comment-table read body stops mid-array', async () => {
		const mock = breakTable(createPostgrestMock(teamWorld()), 'osionos_page_comments', 'cut');
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/comments?pageId=${IDS.sharedA}`, asTeamOwner);
			assert.equal(answer.status, 502, answer.text);
		});
	});
});
