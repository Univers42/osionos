/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-graph-agent.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The page graph shows the pages the caller may read in their workspaces. The in-chat
// agent sees only pages the caller owns or collaborates on: no ownerless page and no
// other user's page, shared or not, reaches the model.

import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentHandler } from '../../scripts/bridge-agent.mjs';
import { verifyAppSessionToken } from '../../scripts/bridge-api.mjs';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const EXTRA = {
	ownerlessShared: 'e1e1e1e1-8888-4888-8888-e1e1e1e1e1e1',
	ownerlessPrivate: 'e2e2e2e2-8888-4888-8888-e2e2e2e2e2e2',
	collabA: 'a7a7a7a7-1111-4111-8111-a7a7a7a7a7a7',
};

function graphWorld() {
	const world = teamWorld();
	const page = (id, ownerId, visibility, title, collaborators = []) => ({
		id, workspace_id: IDS.team, owner_id: ownerId, visibility, title, collaborators, properties: [], parent_page_id: null,
		archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	});
	world.osionos_pages.push(
		page(EXTRA.ownerlessShared, null, 'shared', 'Ownerless notes'),
		page(EXTRA.ownerlessPrivate, null, 'private', 'Ownerless private notes'),
		page(EXTRA.collabA, IDS.userA, 'private', 'A notes shared with B', [{ userId: IDS.userB, role: 'viewer' }]),
	);
	return world;
}

const READABLE_BY_B = [IDS.sharedA, IDS.sharedMemoA, IDS.pageB, EXTRA.ownerlessShared, EXTRA.collabA].sort();
const pageNodeIds = (graph) => graph.nodes.filter((node) => node.data?.kind === 'page').map((node) => node.pk).sort();

describe('page graph', () => {
	it('/api/graph/pages lists the pages the caller may read in their workspaces', async () => {
		const mock = createPostgrestMock(graphWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const graph = await send(base, `/api/graph/pages?workspaceId=${IDS.team}`, sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]));
			assert.equal(graph.status, 200, graph.text);
			assert.deepEqual(pageNodeIds(graph.body), READABLE_BY_B);
		});
	});

	it('/api/graph/data lists the pages the caller may read across their workspaces', async () => {
		const mock = createPostgrestMock(graphWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const graph = await send(base, '/api/graph/data?scope=account', sessionHeaders(config, IDS.userB, IDS.homeB));
			assert.equal(graph.status, 200, graph.text);
			assert.deepEqual(pageNodeIds(graph.body), READABLE_BY_B);
		});
	});
});

function anthropicStream(events) {
	return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const toolTurn = (name, input) => anthropicStream([
	{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tool-1', name } },
	{ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
	{ type: 'message_delta', delta: { stop_reason: 'tool_use' } },
]);
const endTurn = () => anthropicStream([{ type: 'message_delta', delta: { stop_reason: 'end_turn' } }]);

/** Run one agent tool for B through POST /api/agent/chat with a scripted model; returns the tool result. */
async function agentTool(name, input) {
	const mock = createPostgrestMock(graphWorld());
	const turns = [toolTurn(name, input), endTurn()];
	const fetchImpl = async (url, init) => (String(url).startsWith('https://api.anthropic.com/') ? turns.shift() : mock.fetchImpl(url, init));
	const handler = createAgentHandler({ config, verifySession: verifyAppSessionToken, fetchImpl, env: { ANTHROPIC_API_KEY: 'test-key' } });
	const server = createServer((request, response) => void handler(new URL(request.url, 'http://bridge.local'), request, response));
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	try {
		const response = await fetch(`http://127.0.0.1:${server.address().port}/api/agent/chat`, {
			method: 'POST', headers: sessionHeaders(config, IDS.userB, IDS.homeB), body: JSON.stringify({ prompt: 'go' }),
		});
		const frame = (await response.text()).split('\n\n').find((chunk) => chunk.startsWith('event: tool_result'));
		assert.ok(frame, 'the tool ran');
		return JSON.parse(JSON.parse(frame.split('\ndata: ')[1]).text);
	} finally {
		await new Promise((done) => server.close(done));
	}
}

describe('in-chat agent', () => {
	it('search_pages returns only pages the caller owns or collaborates on', async () => {
		const result = await agentTool('search_pages', { query: 'notes' });
		assert.deepEqual(result.pages.map((page) => page.id).sort(), [IDS.pageB, EXTRA.collabA].sort());
	});

	const reads = [
		['the caller\'s own page', IDS.pageB, true],
		['a page shared with the caller as collaborator', EXTRA.collabA, true],
		['another user\'s workspace-shared page', IDS.sharedA, false],
		['an ownerless shared page', EXTRA.ownerlessShared, false],
		['an ownerless private page', EXTRA.ownerlessPrivate, false],
	];
	for (const [name, pageId, readable] of reads) {
		it(`get_page ${readable ? 'returns' : 'refuses'} ${name}`, async () => {
			const result = await agentTool('get_page', { pageId });
			if (readable) assert.equal(result.page?.id, pageId, JSON.stringify(result));
			else assert.deepEqual([result.ok, result.page], [false, undefined], JSON.stringify(result));
		});
	}
});
