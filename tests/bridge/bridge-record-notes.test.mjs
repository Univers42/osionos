/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-record-notes.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Re-opening a record refreshes only what the note mirrors from the record (title,
// properties); what people wrote in the note — and who may read it — survives every
// /open and every sub-item create. A sub-item nests only under a note the caller could
// create a page under.
// Ponytail: the in-memory PostgREST models on_conflict + resolution=ignore-duplicates;
// a live PostgREST's upsert behaviour is not exercised here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recordNoteId } from '../../scripts/bridge-records.mjs';
import { IDS, createPostgrestMock, harnessConfig, patch, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const DB = 'f0f0f0f0-6666-4666-8666-f0f0f0f0f0f0';
const OPEN = `/api/records/${DB}/tasks/7/open`;
const NOTE_ID = recordNoteId(DB, 'tasks', '7');
const WRITTEN = [{ id: 'note-b1', type: 'paragraph', content: 'written in the note' }];
/** A's note from before notes were created shared: private, in the mount's workspace. */
const LEGACY_NOTE = {
	id: NOTE_ID, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'private', parent_page_id: null,
	database_id: `baas:${DB}:tasks`, title: 'Row seven', icon: 'icon:database', surface: 'page', collaborators: [],
	properties: [{ key: 'title', label: 'Title', type: 'text', value: 'Row seven' }, { key: 'status', label: 'Status', type: 'text', value: 'open' }],
	content: WRITTEN, archived_at: null, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
};

function recordWorld(notes = []) {
	const world = teamWorld();
	world.osionos_workspace_databases = [{ workspace_id: IDS.team, db_id: DB, engine: 'postgresql', tables: ['tasks'], edges_table: null, label: 'Tasks' }];
	world.osionos_pages.push(...notes);
	const rows = [{ id: 7, title: 'Row seven', status: 'open' }];
	return { mock: createPostgrestMock(world, { records: { [`${DB}/tasks`]: rows } }), rows };
}

async function openAndWrite(base, mock) {
	const opened = await send(base, OPEN, asA, { method: 'POST' });
	assert.equal(opened.status, 200, opened.text);
	const edited = await send(base, `/api/pages/${NOTE_ID}`, asA, patch({ content: WRITTEN, icon: 'icon:star' }));
	assert.equal(edited.status, 200, edited.text);
	return structuredClone(mock.page(NOTE_ID));
}

describe('record notes keep what people wrote in them', () => {
	it('keeps content, icon and updated_at when the same record is opened again', async () => {
		const { mock } = recordWorld();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const written = await openAndWrite(base, mock);
			const reopened = await send(base, OPEN, asA, { method: 'POST' });
			assert.equal(reopened.status, 200, reopened.text);
			assert.deepEqual(mock.page(NOTE_ID), written);
			assert.deepEqual(reopened.body.content, WRITTEN);
		});
	});

	it('keeps the note content when a sub-item is created under the record', async () => {
		const { mock } = recordWorld();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const written = await openAndWrite(base, mock);
			const created = await send(base, `/api/records/${DB}/tasks/7/subitems`, asA, post({ workspaceId: IDS.homeA, title: 'Sub' }));
			assert.equal(created.status, 201, created.text);
			assert.deepEqual(mock.page(NOTE_ID), written);
		});
	});

	it('keeps a legacy private note private when another member opens it', async () => {
		const { mock } = recordWorld([LEGACY_NOTE]);
		await withBridge(config, mock.fetchImpl, async (base) => {
			await send(base, OPEN, asB, { method: 'POST' });
			const read = await send(base, `/api/pages/${NOTE_ID}`, asB);
			const missing = await send(base, `/api/pages/${IDS.missing}`, asB);
			assert.equal(read.status, 404, read.text);
			assert.deepEqual([read.status, read.body], [missing.status, missing.body]);
			assert.deepEqual([mock.page(NOTE_ID).owner_id, mock.page(NOTE_ID).visibility, mock.page(NOTE_ID).content], [IDS.userA, 'private', WRITTEN]);
		});
	});

	it('keeps the owner\'s visibility choice when another member opens the record', async () => {
		const { mock, rows } = recordWorld();
		await withBridge(config, mock.fetchImpl, async (base) => {
			await openAndWrite(base, mock);
			assert.equal((await send(base, `/api/pages/${NOTE_ID}`, asA, patch({ visibility: 'private' }))).status, 200);
			rows[0].title = 'Row seven, renamed';
			await send(base, OPEN, asB, { method: 'POST' });
			assert.deepEqual([mock.page(NOTE_ID).visibility, mock.page(NOTE_ID).title], ['private', 'Row seven, renamed']);
			const read = await send(base, `/api/pages/${NOTE_ID}`, asB);
			const missing = await send(base, `/api/pages/${IDS.missing}`, asB);
			assert.equal(read.status, 404, read.text);
			assert.deepEqual([read.status, read.body], [missing.status, missing.body]);
		});
	});

	it('refreshes the note title from a renamed record and keeps the content', async () => {
		const { mock, rows } = recordWorld();
		await withBridge(config, mock.fetchImpl, async (base) => {
			await openAndWrite(base, mock);
			// Backdated: the edit and the refresh can land in the same millisecond.
			mock.page(NOTE_ID).updated_at = LEGACY_NOTE.updated_at;
			rows[0].title = 'Row seven, renamed';
			const reopened = await send(base, OPEN, asA, { method: 'POST' });
			assert.equal(reopened.status, 200, reopened.text);
			const note = mock.page(NOTE_ID);
			assert.equal(note.title, 'Row seven, renamed');
			assert.deepEqual([note.content, note.icon], [WRITTEN, 'icon:star']);
			assert.notEqual(note.updated_at, LEGACY_NOTE.updated_at);
		});
	});
});

describe('opening a record answers like reading its note', () => {
	async function openAndRead(base, headers) {
		const opened = await send(base, OPEN, headers, { method: 'POST' });
		const read = await send(base, `/api/pages/${NOTE_ID}`, headers);
		return { opened, read };
	}

	it('answers a member who cannot read a private note exactly like the page read', async () => {
		const { mock } = recordWorld();
		await withBridge(config, mock.fetchImpl, async (base) => {
			await openAndWrite(base, mock);
			assert.equal((await send(base, `/api/pages/${NOTE_ID}`, asA, patch({ visibility: 'private' }))).status, 200);
			const { opened, read } = await openAndRead(base, asB);
			assert.equal(opened.status, 404, opened.text);
			assert.deepEqual([opened.status, opened.body], [read.status, read.body]);
			assert.equal(opened.text.includes(WRITTEN[0].content), false);
		});
	});

	it('answers a member outside the workspace the owner moved the note to exactly like the page read', async () => {
		const { mock } = recordWorld();
		await withBridge(config, mock.fetchImpl, async (base) => {
			await openAndWrite(base, mock);
			assert.equal((await send(base, `/api/pages/${NOTE_ID}`, asA, patch({ workspaceId: IDS.homeA }))).status, 200);
			assert.equal(mock.page(NOTE_ID).workspace_id, IDS.homeA);
			const { opened, read } = await openAndRead(base, asB);
			assert.notEqual(opened.status, 200, opened.text);
			assert.deepEqual([opened.status, opened.body], [read.status, read.body]);
			assert.equal(opened.text.includes(WRITTEN[0].content), false);
		});
	});

	it('returns the full note to a member who can read it', async () => {
		const { mock } = recordWorld();
		await withBridge(config, mock.fetchImpl, async (base) => {
			await openAndWrite(base, mock);
			const { opened, read } = await openAndRead(base, asB);
			assert.equal(opened.status, 200, opened.text);
			assert.deepEqual(opened.body, read.body);
			assert.deepEqual(opened.body.content, WRITTEN);
		});
	});
});

describe('a record sub-item nests only under a note the caller can read', () => {
	const SUBITEM = `/api/records/${DB}/tasks/7/subitems`;
	const REFUSED = {
		'another member\'s private note': LEGACY_NOTE,
		'a shared note its owner moved to a workspace the caller is not in': { ...LEGACY_NOTE, visibility: 'shared', workspace_id: IDS.homeA },
	};
	for (const [name, note] of Object.entries(REFUSED)) {
		it(`answers a sub-item under ${name} like a page create under it, and inserts nothing`, async () => {
			const { mock } = recordWorld([note]);
			const pageCount = mock.rows('osionos_pages').length;
			await withBridge(config, mock.fetchImpl, async (base) => {
				const sub = await send(base, SUBITEM, asB, post({ workspaceId: IDS.homeB, title: 'Sub' }));
				const nested = await send(base, '/api/pages', asB, post({ workspaceId: IDS.homeB, title: 'Sub', parentPageId: NOTE_ID }));
				assert.equal(sub.status, 404, sub.text);
				assert.deepEqual([sub.status, sub.body], [nested.status, nested.body]);
				assert.equal(mock.rows('osionos_pages').length, pageCount);
			});
		});
	}

	it('creates a sub-item under a shared note another member owns', async () => {
		const { mock } = recordWorld([{ ...LEGACY_NOTE, visibility: 'shared' }]);
		const sub = await withBridge(config, mock.fetchImpl, (base) => send(base, SUBITEM, asB, post({ workspaceId: IDS.homeB, title: 'Sub' })));
		assert.equal(sub.status, 201, sub.text);
		assert.equal(sub.body.parentPageId, NOTE_ID);
	});
});
