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
// properties, visibility); what people wrote in the note survives every /open and
// every sub-item create.
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

	it('lets another member read a legacy private note after opening it, without taking it over', async () => {
		const legacy = {
			id: NOTE_ID, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'private', parent_page_id: null,
			database_id: `baas:${DB}:tasks`, title: 'Row seven', icon: 'icon:database', surface: 'page', collaborators: [],
			properties: [{ key: 'title', label: 'Title', type: 'text', value: 'Row seven' }, { key: 'status', label: 'Status', type: 'text', value: 'open' }],
			content: WRITTEN, archived_at: null, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
		};
		const { mock } = recordWorld([legacy]);
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, OPEN, asB, { method: 'POST' })).status, 200);
			const read = await send(base, `/api/pages/${NOTE_ID}`, asB);
			assert.equal(read.status, 200, read.text);
			assert.deepEqual(read.body.content, WRITTEN);
			assert.equal(mock.page(NOTE_ID).owner_id, IDS.userA);
		});
	});

	it('refreshes the note title from a renamed record and keeps the content', async () => {
		const { mock, rows } = recordWorld();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const written = await openAndWrite(base, mock);
			rows[0].title = 'Row seven, renamed';
			const reopened = await send(base, OPEN, asA, { method: 'POST' });
			assert.equal(reopened.status, 200, reopened.text);
			const note = mock.page(NOTE_ID);
			assert.equal(note.title, 'Row seven, renamed');
			assert.deepEqual([note.content, note.icon], [WRITTEN, 'icon:star']);
			assert.notEqual(note.updated_at, written.updated_at);
		});
	});
});
