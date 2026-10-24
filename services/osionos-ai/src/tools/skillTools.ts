import { z } from 'zod';
import { attributeText, escapeTags } from '../runs/sources.ts';
import { findBuiltinSkill } from '../skills/builtins.ts';
import type { BuiltinSkill } from '../skills/builtins.ts';
import type { ReadTool } from './types.ts';

/**
 * `load_skill`: the model asks for the full text of one of the skills the
 * prompt listed.
 *
 * The prompt carries the index only; this tool is how a body reaches the
 * context, as a tool result, and so through the same step share and pool as
 * every other read tool. It answers for exactly the ids of the index (devil
 * C38, C40): a built-in comes from the code, a workspace skill from the
 * database at load time — the version the index LISTED, even when the skill
 * was edited since (`loadListedVersion`), and nothing when it was archived.
 */

/** What a load holds. */
export interface LoadSkillData {
	id: string;
	version: number;
	body: string;
	source: 'builtin' | 'workspace';
}

/** Loose, like the other read tools: a wrong shape must not end the run. */
const loadSkillArgs = z.object({
	id: z.unknown().optional().describe('the id of the skill, as the <skills> index lists it'),
});

/** The workspace skills a run listed, and how to read one of them. */
export interface WorkspaceSkillLoader {
	/** The listed entries of the workspace, by id (the slug). */
	entries: ReadonlyMap<string, { version: number; skillId: string }>;
	/** The body of that version of that skill, or null when it is gone. */
	load(skillId: string, version: number): Promise<string | null>;
}

/**
 * The tool for a run whose index lists `allowed` (built-in ids, and the ids of
 * `workspace`). `find` is a seam for tests; production uses the built-in list.
 */
export function loadSkillTool(
	allowed: readonly string[],
	find: (id: string) => BuiltinSkill | null = findBuiltinSkill,
	workspace?: WorkspaceSkillLoader,
): ReadTool<z.infer<typeof loadSkillArgs>, LoadSkillData> {
	return {
		name: 'load_skill',
		description: 'Load the full text of one of your skills by its id, when the task matches it.',
		kind: 'read',
		input: loadSkillArgs,
		async run(_ctx, args) {
			const id = typeof args.id === 'string' ? args.id : '';
			const refusal = { ok: false, error: `no such skill; your skills are: ${allowed.join(', ')}` } as const;
			if (!allowed.includes(id)) return refusal;
			const listed = workspace?.entries.get(id);
			if (listed && workspace) {
				const body = await workspace.load(listed.skillId, listed.version);
				if (body === null) return refusal;
				return { ok: true, data: { id, version: listed.version, body, source: 'workspace' } };
			}
			const skill = find(id);
			if (!skill) return refusal;
			return { ok: true, data: { id: skill.id, version: skill.version, body: skill.body, source: 'builtin' } };
		},
		render: (data) =>
			`<skill id="${attributeText(data.id)}" version="${data.version}">\n${escapeSkillTags(data.body)}\n</skill>`,
		sources: () => [],
		pin: (data) => ({ id: data.id, version: data.version, source: data.source }),
	};
}

/**
 * A body cannot close or open a <skill> tag (devil C38): its text is data.
 * The generic helper is `escapeTags` (src/runs/sources.ts).
 */
export function escapeSkillTags(body: string): string {
	return escapeTags(body, ['skill']);
}
