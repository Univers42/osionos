/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-graph-edges.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LINK_EDGES_RPC, MAX_IDS_PER_CALL, PAGE_ROWS_RPC, readLinkEdges } from '../../scripts/bridge-graph-edges.mjs';

/**
 * The edge read on its own: what it refuses, how it cuts a big id set, and the
 * rows it hands back. The reader is a fake of the two RPCs, which answers the
 * way the SQL functions do and records every call.
 */

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const WORKSPACE = 'bbbbbbbb-0000-4000-8000-000000000001';

function uuid(index) {
	return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function pageRow(id, visibility = 'shared') {
	return { id, workspace_id: WORKSPACE, owner_id: 'cccccccc-0000-4000-8000-000000000001', visibility, collaborators: [], archived_at: null };
}

/** A fake of the two RPCs over the given links and pages, with the bound of the SQL. */
function fakeRead(links, pages) {
	const calls = [];
	const read = async (rpc, body) => {
		calls.push({ rpc, body });
		if (rpc === LINK_EDGES_RPC) {
			const sources = body.p_source_ids;
			const targets = body.p_target_ids;
			if ((sources?.length ?? 0) > MAX_IDS_PER_CALL || (targets?.length ?? 0) > MAX_IDS_PER_CALL) return [];
			return links.filter((link) => (!sources || sources.includes(link.source_page_id)) && (!targets || targets.includes(link.target_page_id)));
		}
		if (rpc === PAGE_ROWS_RPC) {
			if (body.p_ids.length > MAX_IDS_PER_CALL) return [];
			return pages.filter((row) => body.p_ids.includes(row.id));
		}
		throw new Error(`unknown rpc ${rpc}`);
	};
	return { read, calls };
}

describe('the edge read of the graph', () => {
	it('refuses to read with neither source ids nor target ids', async () => {
		const { read, calls } = fakeRead([], []);
		await assert.rejects(readLinkEdges(read, { userId: USER, workspaces: [WORKSPACE] }), /needs sourceIds or targetIds/);
		assert.equal(calls.length, 0, 'nothing is read');
	});

	it('cuts a big source set into calls the SQL accepts, and loses no edge', async () => {
		const ids = Array.from({ length: 2_500 }, (_, index) => uuid(index + 1));
		const target = uuid(9_999);
		const links = [ids[0], ids[1_500], ids[2_499]].map((source) => ({ source_page_id: source, target_page_id: target }));
		const pages = [...ids, target].map((id) => pageRow(id));
		const { read, calls } = fakeRead(links, pages);
		const result = await readLinkEdges(read, { sourceIds: ids, userId: USER, workspaces: [WORKSPACE] });
		assert.equal(result.links.length, 3, 'every edge survives the cut');
		const linkCalls = calls.filter((call) => call.rpc === LINK_EDGES_RPC);
		assert.equal(linkCalls.length, 3);
		assert.ok(linkCalls.every((call) => call.body.p_source_ids.length <= MAX_IDS_PER_CALL));
	});

	it('hands back the rows of the readable endpoints only', async () => {
		const [hidden, open, probe] = [uuid(1), uuid(2), uuid(3)];
		const links = [
			{ source_page_id: hidden, target_page_id: probe },
			{ source_page_id: open, target_page_id: probe },
		];
		const { read } = fakeRead(links, [pageRow(hidden, 'private'), pageRow(open), pageRow(probe)]);
		const result = await readLinkEdges(read, { targetIds: [probe], userId: USER, workspaces: [WORKSPACE] });
		assert.deepEqual(result.links, [{ source: open, target: probe }]);
		assert.equal(result.rows.has(hidden), false, 'the private page row does not leave the module');
		assert.equal(result.rows.has(open), true);
	});
});
