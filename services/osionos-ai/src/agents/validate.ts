import { z } from 'zod';
import { READ_TOOL_NAMES, WRITE_TOOL_NAMES } from './builtins.ts';
import type { CustomAgentConfig } from './config.ts';
import { assertAgentSkills, assertPrefixFits, PrefixTooLargeError } from './prefix.ts';
import type { AgentFields } from './repo.ts';

/**
 * What a client may write into an agent, and what the server checks before it
 * stores it (C306, C307, C332).
 *
 * The schemas are `.strict()`: `model`, `connection_id`, `effort`, `knowledge`
 * and every other key a custom agent does not have are a 422, not a field that
 * is ignored. An agent holds no connection, so it cannot borrow one (C309).
 */

const TOOLS = new Set<string>([...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES]);

const text = (max: number) => z.string().max(max).refine((value) => value.trim().length > 0, 'blank');

const name = text(48);
const description = z.string().max(200);
const instructions = text(1500);
const tools = z.array(z.string().max(64)).max(64);
const skills = z.array(z.string().max(64)).max(16);
const uuid = z.string().uuid();

export const createAgentSchema = z
	.object({
		scope: z.enum(['user', 'workspace']),
		workspaceId: uuid.optional(),
		name,
		description: description.default(''),
		instructions,
		tools: tools.default([]),
		skills: skills.default([]),
	})
	.strict();

export const updateAgentSchema = z
	.object({
		expectedVersion: z.number().int().min(1),
		name: name.optional(),
		description: description.optional(),
		instructions: instructions.optional(),
		tools: tools.optional(),
		skills: skills.optional(),
	})
	.strict();

/** The settings of a workspace: both switches, always (C305). */
export const settingsSchema = z.object({ agents_enabled: z.boolean(), custom_agents_allowed: z.boolean() }).strict();

/** The code of the first reason the fields cannot be stored, or null. */
export function fieldsRefusal(fields: AgentFields, scope: 'user' | 'workspace'): string | null {
	if (fields.tools.some((tool) => !TOOLS.has(tool))) return 'unknown_tool';
	try {
		assertAgentSkills(fields.skills);
	} catch {
		return 'invalid_skills';
	}
	// A draft with a worst-case skills index: what is saved renders under the cap forever (C293).
	const draft: CustomAgentConfig = {
		kind: 'custom',
		scope,
		id: '00000000-0000-4000-8000-000000000001',
		version: 1,
		...fields,
		knowledge: [],
	};
	try {
		assertPrefixFits(draft);
	} catch (error) {
		if (error instanceof PrefixTooLargeError) return error.code;
		throw error;
	}
	return null;
}

/** The tools, without repeats and in the order written. */
export function uniqueNames(values: readonly string[]): string[] {
	return [...new Set(values)];
}
