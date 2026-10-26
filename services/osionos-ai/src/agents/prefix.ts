import { SYSTEM_PROMPT } from '../runs/prompt.ts';
import { SKILL_INDEX_MAX, findBuiltinSkill } from '../skills/builtins.ts';
import type { BuiltinSkill } from '../skills/builtins.ts';
import { buildSkillIndex } from '../skills/runSkills.ts';
import type { SkillIndex } from '../skills/runSkills.ts';
import type { AgentConfig } from './config.ts';
import { systemPromptFor } from './prompt.ts';

/**
 * The prefix an agent adds to every call of a run, measured as rendered.
 *
 * One render path (C327): `prefixCost` and `assertPrefixFits` call
 * `systemPromptFor`, the function the runner and the upstream call, so the
 * escaped text, the workspace banner and the extended boundary line are all
 * counted. Measuring the raw instructions is the bug this module exists to
 * prevent: `&` renders as five characters, `<` as four.
 */

/** The most characters an agent may add to the base system prompt. */
export const PREFIX_MAX = 4096;

/**
 * The smallest context window, in tokens, among the models a public surface
 * can route to.
 *
 * Recorded floor (C294/C329), 2026-10-26: the live `OSIONOS_AI_PLATFORM_MODELS`
 * ids are nvidia/nemotron-3-ultra-550b-a55b:free (1,000,000),
 * poolside/laguna-s-2.1:free (262,144), google/gemma-4-31b-it:free (262,144)
 * and openrouter/free (200,000), per the `context_length` of OpenRouter's
 * public `GET /api/v1/models`. The smallest is 200,000; 8192 stays the
 * declared floor, far under it.
 *
 * Caveat: `PlatformModelEntry` has no context field, so nothing re-derives
 * this when the list changes; a deployment adding a model under 8192 breaks
 * the margin silently (the check passes while a model is too small).
 * `openrouter/free` is a router: the 200,000 is its own figure, not the
 * smallest model it may pick. A user's own connection (a small local model)
 * is outside this check.
 */
export const SMALLEST_CONTEXT_TOKENS = 8192;

/** The index a worst-case check renders: it fills the cap, whatever the real one holds. */
const WORST_CASE_INDEX: SkillIndex = {
	block: 'x'.repeat(SKILL_INDEX_MAX),
	entries: [],
	dropped: [],
};

/** The characters the agent (and the index) add to the base system prompt. */
export function prefixCost(agent: AgentConfig | null, index?: SkillIndex): number {
	return systemPromptFor(agent, index).length - SYSTEM_PROMPT.length;
}

/**
 * Throws when the agent, with a full skills index, adds more than PREFIX_MAX.
 *
 * It reserves the whole SKILL_INDEX_MAX instead of the actual index, so a
 * workspace skill added later cannot push a saved agent over (C293, C295).
 */
export function assertPrefixFits(agent: AgentConfig): void {
	const cost = prefixCost(agent, WORST_CASE_INDEX);
	if (cost > PREFIX_MAX) {
		throw new PrefixTooLargeError(cost);
	}
}

/** The agent renders over PREFIX_MAX: the route answers 422 `prefix_too_large`. */
export class PrefixTooLargeError extends Error {
	readonly code = 'prefix_too_large';
	readonly cost: number;

	constructor(cost: number) {
		super(`the agent renders ${cost} characters over the base prompt, the cap is ${PREFIX_MAX}`);
		this.cost = cost;
	}
}

/** The most built-in skills a custom agent may list. */
export const AGENT_SKILLS_MAX = 5;

/**
 * At write (C328): the skills are unique, at most five, each a built-in, and
 * their index fits SKILL_INDEX_MAX. Throws a plain Error naming the problem;
 * the route turns it into 422.
 */
export function assertAgentSkills(
	skills: readonly string[],
	find: (id: string) => BuiltinSkill | null = findBuiltinSkill,
): void {
	if (skills.length > AGENT_SKILLS_MAX) throw new Error(`an agent lists at most ${AGENT_SKILLS_MAX} skills`);
	if (new Set(skills).size !== skills.length) throw new Error('the skills of an agent are unique');
	// buildSkillIndex throws on an unknown id and on an index over the cap.
	buildSkillIndex(skills, [], find);
}

/**
 * At use (C328): the skills of a stored agent that still exist. A removed id
 * is dropped with a log event that carries ids only, never an error, so a
 * stored agent (a pinned old version too) always loads.
 */
export function usableSkills(
	skills: readonly string[],
	find: (id: string) => BuiltinSkill | null = findBuiltinSkill,
): string[] {
	const kept = skills.filter((id) => find(id) !== null);
	const dropped = skills.filter((id) => find(id) === null);
	if (dropped.length > 0) console.warn(JSON.stringify({ event: 'agent_skill_dropped', dropped }));
	return kept;
}
