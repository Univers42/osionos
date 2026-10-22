import { z } from 'zod';
import { attributeText } from '../runs/sources.ts';
import { findBuiltinSkill } from '../skills/builtins.ts';
import type { BuiltinSkill } from '../skills/builtins.ts';
import type { ReadTool } from './types.ts';

/**
 * `load_skill`: the model asks for the full text of one of its agent's skills.
 *
 * The prompt carries the index only; this tool is how a body reaches the
 * context, as a tool result, and so through the same step share and pool as
 * every other read tool. It reads the code, not the database, and records
 * nothing. The tool exists only in a run whose agent has skills, and it
 * answers only for those skills (devil C38, C40).
 */

/** What a load holds. */
export interface LoadSkillData {
	id: string;
	version: number;
	body: string;
}

/** Loose, like the other read tools: a wrong shape must not end the run. */
const loadSkillArgs = z.object({
	id: z.unknown().optional().describe('the id of the skill, as the <skills> index lists it'),
});

/**
 * The tool for an agent whose skills are `allowed`.
 *
 * `find` is a seam for tests; production uses the built-in list.
 */
export function loadSkillTool(
	allowed: readonly string[],
	find: (id: string) => BuiltinSkill | null = findBuiltinSkill,
): ReadTool<z.infer<typeof loadSkillArgs>, LoadSkillData> {
	return {
		name: 'load_skill',
		description: 'Load the full text of one of your skills by its id, when the task matches it.',
		kind: 'read',
		input: loadSkillArgs,
		async run(_ctx, args) {
			const id = typeof args.id === 'string' ? args.id : '';
			const skill = allowed.includes(id) ? find(id) : null;
			if (!skill) return { ok: false, error: `no such skill; your skills are: ${allowed.join(', ')}` };
			return { ok: true, data: { id: skill.id, version: skill.version, body: skill.body } };
		},
		render: (data) => `<skill id="${attributeText(data.id)}" version="${data.version}">\n${data.body}\n</skill>`,
		sources: () => [],
		pin: (data) => ({ id: data.id, version: data.version }),
	};
}
