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

	it('the write tools are exactly these six, and only the three eligible ones are true', () => {
		const verdicts = Object.fromEntries(writeTools(true).map(({ name }) => [name, isAutoEligible(name)]));
		assert.deepEqual(verdicts, { add_blocks: true, rename_page: true, create_page: true, archive_page: false, update_page_settings: false, build_plan: false });
	});

	it('AUTO_ELIGIBLE is a subset of the write tool names', () => {
		const names = new Set(writeTools(true).map(({ name }) => name));
		for (const tool of AUTO_ELIGIBLE) assert.ok(names.has(tool), `${tool} is not a write tool`);
	});

	it('finds no never-grantable stem in any write tool name', () => {
		for (const { name } of writeTools(true)) {
			for (const stem of NEVER_GRANTABLE) assert.ok(!name.includes(stem), `${name} contains ${stem}`);
		}
	});
});
