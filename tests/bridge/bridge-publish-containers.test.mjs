// Phase 7 (ADR 0064 PS39, ADR 0067 PH3, PH5): columns and block style reach a published copy only
// when the bridge switch is on. Off, the snapshot is byte-identical to the one before Phase 7.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishSnapshot, publishContainersEnabled } from '../../scripts/bridge-publish-snapshot.mjs';
import { OWNER_PAGE } from './fixtures/publishContainersPage.mjs';

const TODAY = readFileSync(new URL('./fixtures/publish-snapshot-today.json', import.meta.url), 'utf8');
const flat = (nodes) => nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);
const byId = (nodes, id) => flat(nodes).find((n) => n.id === id);

describe('publish containers switch', () => {
	it('is off unless OSIONOS_PUBLISH_CONTAINERS is exactly 1', () => {
		assert.equal(publishContainersEnabled({}), false);
		for (const value of ['', '0', 'true', 'yes', ' 1']) assert.equal(publishContainersEnabled({ OSIONOS_PUBLISH_CONTAINERS: value }), false, value);
		assert.equal(publishContainersEnabled({ OSIONOS_PUBLISH_CONTAINERS: '1' }), true);
	});

	it('off: the snapshot is byte-identical to the pre-Phase-7 output (PH5)', () => {
		assert.equal(JSON.stringify(publishSnapshot(OWNER_PAGE)), TODAY);
		assert.equal(JSON.stringify(publishSnapshot(OWNER_PAGE, { containers: false })), TODAY);
	});

	it('on: column_list and column survive with their text and children (PS39)', () => {
		const out = publishSnapshot(OWNER_PAGE, { containers: true });
		assert.deepEqual(byId(out, 'c1').children.map((n) => n.content), ['Left, **bold**']);
		assert.equal(byId(out, 'c2p').content.includes('aaaaaaaa'), false);
		assert.deepEqual(byId(out, 'cl').children.map((n) => n.id), ['c1', 'c2']);
	});

	it('on: style keeps only scale values, never an unknown or prototype key', () => {
		const out = publishSnapshot(OWNER_PAGE, { containers: true });
		assert.deepEqual(byId(out, 'styled').style, { padding: 3, surface: 'muted' });
		assert.deepEqual(byId(out, 'cl').style, { layout: 'grid', cols: 3, gap: 4 });
		assert.deepEqual(byId(out, 'c1').style, { span: 2 });
		assert.equal(Object.hasOwn(byId(out, 'c2'), 'style'), false);
	});

	it('on: nothing reads or writes a cover in the public copy (PH3)', () => {
		const json = JSON.stringify(publishSnapshot(OWNER_PAGE, { containers: true }));
		assert.doesNotMatch(json, /cover/);
	});

	it('on: the node and depth caps are unchanged (PS41)', () => {
		const blocks = Array.from({ length: 20_001 }, (_, i) => ({ id: `b${i}`, type: 'paragraph', content: 'x' }));
		assert.equal(publishSnapshot(blocks, { containers: true }).length, 20_000);
		let deep = { id: 'leaf', type: 'column', content: '' };
		for (let i = 0; i < 40; i++) deep = { id: `d${i}`, type: 'column_list', content: '', children: [deep] };
		assert.equal(byId(publishSnapshot([deep], { containers: true }), 'leaf'), undefined);
	});
});
