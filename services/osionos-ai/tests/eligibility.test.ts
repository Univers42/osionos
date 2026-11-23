import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { AUTO_ELIGIBLE, NEVER_GRANTABLE, isAutoEligible } = await import('../src/modes/eligibility.ts');
const { writeTools } = await import('../src/tools/writeToolList.ts');

/** The closed auto list (AM17) and the never-grantable stems (G6). */
describe('auto eligibility', () => {
	it('is false for the tools a run may never apply unattended', () => {
		for (const tool of ['archive_page', 'build_plan', 'mcp_call', 'some_future_write', '']) {
			assert.equal(isAutoEligible(tool), false, tool);
		}
	});

	it('is true for the three eligible tools', () => {
		for (const tool of ['add_blocks', 'rename_page', 'create_page']) {
			assert.equal(isAutoEligible(tool), true, tool);
		}
	});

	it('is false for every write tool outside the list', () => {
		for (const { name } of writeTools(true)) {
			assert.equal(isAutoEligible(name), (AUTO_ELIGIBLE as readonly string[]).includes(name), name);
		}
	});

	it('finds no never-grantable stem in any write tool name', () => {
		for (const { name } of writeTools(true)) {
			for (const stem of NEVER_GRANTABLE) assert.ok(!name.includes(stem), `${name} contains ${stem}`);
		}
	});
});
