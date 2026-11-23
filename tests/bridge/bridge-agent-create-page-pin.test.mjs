// osionos#240 M240-16: the agent's create_page tool keeps its own plain conversion when the
// from-markdown route arrives. Markdown is not parsed there: the text is cut at 20,000
// characters and each non-empty line becomes one trimmed paragraph. Changing that is its own
// decision, so this test pins the output.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toolCreatePage } from '../../scripts/bridge-agent.mjs';
import { IDS, createPostgrestMock, harnessConfig } from './support/bridge-harness.mjs';

const SESSION = { userId: IDS.userB };

async function createWith(markdown) {
	const mock = createPostgrestMock({ osionos_workspace_members: [{ workspace_id: IDS.team, user_id: IDS.userB, role: 'editor', permissions: ['create', 'read', 'update'] }] });
	const result = await toolCreatePage({ config: harnessConfig(), fetchImpl: mock.fetchImpl }, SESSION, { workspaceId: IDS.team, title: 'Agent page', markdown });
	return { result, stored: mock.rows('osionos_pages').at(-1) };
}

describe('the agent create_page tool (M240-16)', () => {
	it('stores one trimmed paragraph per non-empty line, markdown left as text', async () => {
		const { stored, result } = await createWith('# Title\n\n  - item  \r\n**bold**\n\n> quote');
		assert.deepEqual(stored.content, [
			{ type: 'paragraph', content: '# Title' },
			{ type: 'paragraph', content: '- item' },
			{ type: 'paragraph', content: '**bold**' },
			{ type: 'paragraph', content: '> quote' },
		]);
		assert.equal(stored.visibility, 'private');
		assert.equal(stored.owner_id, IDS.userB);
		assert.deepEqual(result.created, { id: stored.id, title: 'Agent page' });
	});

	it('cuts the text at 20,000 characters', async () => {
		const { stored } = await createWith(`${'a'.repeat(19_999)}bc\nnext line`);
		assert.deepEqual(stored.content, [{ type: 'paragraph', content: `${'a'.repeat(19_999)}b` }]);
	});

	it('stores no blocks for empty markdown', async () => {
		assert.deepEqual((await createWith('')).stored.content, []);
	});
});
