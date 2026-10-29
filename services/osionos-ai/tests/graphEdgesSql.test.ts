import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { MAX_IDS_PER_CALL } from '../../../scripts/bridge-graph-edges.mjs';
import { startHarness } from './harness.ts';
import { USER_A, WORKSPACE_A } from './retrievalSeed.ts';

/**
 * The two edge-read functions of the graph migration, on the real database:
 * both link arrays NULL reads nothing (it would be every link), and an array
 * above the bound of one call reads nothing either — the bridge's module cuts
 * a bigger set into calls of that size.
 */

const harness = await startHarness();
const db: Pool = harness.app.db;

const applied = await db.query("select to_regprocedure('public.osionos_bridge_graph_links(uuid[], uuid[])') as fn");
const hasGraph = Boolean(applied.rows[0]?.fn);

const source = randomUUID();
const target = randomUUID();

after(async () => {
	if (hasGraph) {
		await db.query('delete from public.osionos_page_links where source_page_id = $1', [source]);
		await db.query('delete from public.osionos_pages where id = $1', [source]);
	}
	await harness.app.close();
	await harness.mock.close();
});

/** The ids of a call that is one over the bound, the real ones among them. */
function overTheBound(...real: string[]): string[] {
	return [...real, ...Array.from({ length: MAX_IDS_PER_CALL + 1 - real.length }, () => randomUUID())];
}

describe('the edge-read functions of the graph', { skip: hasGraph ? false : 'the graph migration was not applied' }, () => {
	it('read a link by its source, nothing with both arrays NULL, nothing over the bound', async () => {
		await db.query('insert into public.osionos_page_links (source_page_id, target_page_id, workspace_id) values ($1, $2, $3)', [
			source,
			target,
			WORKSPACE_A,
		]);
		const links = 'select count(*)::int as n from public.osionos_bridge_graph_links($1::uuid[], $2::uuid[])';
		const bySource = await db.query(links, [[source], null]);
		assert.equal(bySource.rows[0].n, 1, 'the link of the source is read');
		const everything = await db.query(links, [null, null]);
		assert.equal(everything.rows[0].n, 0, 'both NULL reads no link');
		const tooMany = await db.query(links, [overTheBound(source), null]);
		assert.equal(tooMany.rows[0].n, 0, 'a call over the bound reads no link');
	});

	it('reads a page row by its id, and none over the bound', async () => {
		await db.query(
			`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, collaborators, content)
			 values ($1, $2, $3, 'Source', 'shared', '[]'::jsonb, '[]'::jsonb)`,
			[source, WORKSPACE_A, USER_A],
		);
		const rows = 'select count(*)::int as n from public.osionos_bridge_pages_by_ids($1::uuid[])';
		assert.equal((await db.query(rows, [[source]])).rows[0].n, 1, 'the row of the page is read');
		assert.equal((await db.query(rows, [overTheBound(source)])).rows[0].n, 0, 'a call over the bound reads no row');
	});
});
