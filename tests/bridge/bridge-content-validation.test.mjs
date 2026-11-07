// A write the app could never render is refused at the door (#244), and a sound
// block of a type this server has never heard of still saves.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatedDatabaseState, validatedPageContent } from '../../scripts/bridge-content-validation.mjs';

const refused = (run, pattern) => assert.throws(run, (error) => error.status === 422 && pattern.test(error.message));

describe('page content', () => {
	it('keeps a normal page, nested blocks and an absent body', () => {
		const blocks = [{ id: 'a', type: 'paragraph', content: 'x', children: [{ id: 'b', type: 'quote' }] }];
		assert.equal(validatedPageContent(blocks), blocks);
		assert.deepEqual(validatedPageContent(undefined), []);
	});
	it('accepts a block type it does not know', () => {
		assert.doesNotThrow(() => validatedPageContent([{ type: 'from_a_newer_client', content: '' }]));
	});
	it('refuses the measured bad writes, naming the field', () => {
		refused(() => validatedPageContent([{ type: 'not_a_block', content: 5 }]), /content\[0\]\.content/);
		refused(() => validatedPageContent([{ type: 'diagram', diagramSpec: { kind: 'nope' } }]), /diagramSpec\.kind/);
		refused(() => validatedPageContent({ type: 'paragraph' }), /array of blocks/);
		refused(() => validatedPageContent([{ type: 'p', children: [{ content: 'x' }] }]), /children\[0\]\.type/);
	});
	it('bounds nesting', () => {
		let block = { type: 'p' };
		for (let depth = 0; depth < 70; depth += 1) block = { type: 'p', children: [block] };
		refused(() => validatedPageContent([block]), /nests deeper/);
	});
	it('refuses raw CSS class strings in block color or calloutTone, accepting semantic colors', () => {
		refused(
			() => validatedPageContent([{ type: 'callout', color: 'bg-danger-surface-muted text-danger-text-tag' }]),
			/content\[0\]\.color/
		);
		refused(
			() => validatedPageContent([{ type: 'callout', color: 'bg-[#ff0000]' }]),
			/content\[0\]\.color/
		);
		refused(
			() => validatedPageContent([{ type: 'callout', calloutTone: 'text-orange-500' }]),
			/content\[0\]\.calloutTone/
		);
		refused(
			() => validatedPageContent([{ type: 'callout', calloutTone: 'warning' }]),
			/content\[0\]\.calloutTone/
		);
		assert.doesNotThrow(() => validatedPageContent([{ type: 'callout', calloutIcon: '⚠️', calloutTone: 'orange' }]));
		assert.doesNotThrow(() => validatedPageContent([{ type: 'callout', color: 'icon:text-quote' }]));
		assert.doesNotThrow(() => validatedPageContent([{ type: 'callout', color: 'img:https://x.test/bg-hero.png' }]));
		assert.doesNotThrow(() => validatedPageContent([{ type: 'callout', color: '💡' }]));
	});
});

describe('database state', () => {
	it('keeps a database slice', () => {
		const state = { databases: {}, pages: {}, views: {} };
		assert.equal(validatedDatabaseState(state), state);
	});
	it('refuses state that holds no database', () => {
		refused(() => validatedDatabaseState({ nonsense: 1 }), /must hold/);
		refused(() => validatedDatabaseState({ pages: [] }), /state\.pages/);
		refused(() => validatedDatabaseState(undefined), /must be an object/);
	});
	it('refuses database options with raw CSS classes and accepts semantic colors', () => {
		const badState = {
			databases: {
				db1: {
					properties: {
						status: {
							type: 'select',
							options: [{ id: 'opt1', value: 'Urgent', color: 'bg-danger-surface-muted text-danger-text-tag' }],
						},
					},
				},
			},
			pages: {},
			views: {},
		};
		refused(() => validatedDatabaseState(badState), /state\.databases\.db1\.properties\.status\.options\[0\]\.color/);

		const goodState = {
			databases: {
				db1: {
					properties: {
						status: {
							type: 'select',
							options: [{ id: 'opt1', value: 'Urgent', color: 'red' }],
						},
					},
				},
			},
			pages: {},
			views: {},
		};
		assert.equal(validatedDatabaseState(goodState), goodState);
	});
});
