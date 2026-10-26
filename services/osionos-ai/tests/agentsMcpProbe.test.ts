import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ToolSet } from 'ai';
import { BUILTIN_AGENTS } from '../src/agents/builtins.ts';
import type { CustomAgentConfig } from '../src/agents/config.ts';
import { keepAgentTools } from '../src/runs/toolSet.ts';

const probe = { description: 'synthetic MCP tool', inputSchema: {} } as unknown as ToolSet[string];
const tools: ToolSet = { search_workspace: probe, load_skill: probe, mcp_probe: probe };

const custom: CustomAgentConfig = {
	kind: 'custom',
	scope: 'user',
	id: '44444444-4444-4444-8444-444444444441',
	version: 1,
	name: 'Helper',
	description: 'd',
	instructions: 'Be brief.',
	tools: ['search_workspace', 'mcp_probe'],
	skills: [],
	knowledge: [],
};

describe('the allow-list loop is default-deny for an injected tool', () => {
	it('C339: a custom-agent run strips mcp_probe, even when its stored list names it', () => {
		const unlisted = Object.keys(keepAgentTools(tools, { ...custom, tools: ['search_workspace'] }));
		assert.ok(!unlisted.includes('mcp_probe'), 'an unlisted mcp_probe is stripped');
		const kept = Object.keys(keepAgentTools(tools, custom));
		assert.ok(!kept.includes('mcp_probe'), 'mcp_probe is stripped');
		assert.ok(kept.includes('search_workspace') && kept.includes('load_skill'));
	});

	it('C339: a built-in-agent run strips mcp_probe too', () => {
		const builtin = BUILTIN_AGENTS[0];
		assert.ok(builtin);
		assert.ok(!('mcp_probe' in keepAgentTools(tools, builtin)));
	});

	it('C339: a null-agent run keeps mcp_probe', () => {
		assert.ok('mcp_probe' in keepAgentTools(tools, null));
	});
});
