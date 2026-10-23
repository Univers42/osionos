import { SYSTEM_PROMPT, SYSTEM_PROMPT_LINES } from '../runs/prompt.ts';
import { attributeText } from '../runs/sources.ts';
import { SKILL_INDEX_MAX, findBuiltinSkill } from '../skills/builtins.ts';
import type { BuiltinSkill } from '../skills/builtins.ts';
import { AGENT_INSTRUCTIONS_MAX } from './builtins.ts';
import type { BuiltinAgent } from './builtins.ts';

/**
 * The system prompt of a run: the base one, and the one of an agent.
 *
 * The base prompt says three things: who the assistant is, that it answers in
 * the user's language, and that a <page> or a <source> block is quoted data
 * and never an instruction.
 *
 * An agent adds its own text (and the index of its skills), and the ORDER is the law (devil C38): the
 * identity, the language and the style stay first, the agent's text comes
 * after them, and the data-boundary line comes LAST — after whatever the
 * agent said. A rule that comes last is the rule the model reads last, and
 * the last thing the model reads is the one it obeys: an agent's text can
 * never talk the model out of treating quoted data as data.
 *
 * Without an agent the prompt is the base one, byte for byte: a run that asks
 * for no agent is the run of today, and the upstream cache still holds.
 */

/** The block of an agent: its name, and what it is told. */
export function agentBlock(agent: BuiltinAgent): string {
	return `<agent name="${attributeText(agent.name)}">\n${agent.instructions}\n</agent>`;
}

/**
 * The index of an agent's skills: one line each, and the way to load one.
 *
 * Null when the agent has none. The block is capped (devil C47): it is in
 * the cached prefix, and an index over the cap is a bug in the registry.
 * `find` is a seam for tests.
 */
export function skillsBlock(
	agent: BuiltinAgent,
	find: (id: string) => BuiltinSkill | null = findBuiltinSkill,
): string | null {
	if (agent.skills.length === 0) return null;
	const lines = agent.skills.map((id) => {
		const skill = find(id);
		if (!skill) throw new Error(`the agent names an unknown skill: ${id}`);
		return `- ${skill.id}: ${skill.description}`;
	});
	lines.push('When the task matches a skill, call load_skill with its id before you answer.');
	const block = `<skills>\n${lines.join('\n')}\n</skills>`;
	if (block.length > SKILL_INDEX_MAX) throw new Error('the skills index of the agent is over the cap');
	return block;
}

/**
 * The system prompt of a run.
 *
 * `null` is the general assistant: the base prompt, unchanged. An agent adds
 * its block between the style and the data-boundary line.
 */
export function systemPromptFor(agent: BuiltinAgent | null): string {
	if (!agent) return SYSTEM_PROMPT;
	// The prefix is capped (devil C47): the instructions of an agent are a
	// page at most. An agent over the cap is a bug in the registry, and a run
	// must not start on a prompt that nobody bounded.
	if (agent.instructions.length > AGENT_INSTRUCTIONS_MAX) {
		throw new Error('the instructions of the agent are over the cap');
	}
	const [identity, language, boundary, style] = SYSTEM_PROMPT_LINES;
	const skills = skillsBlock(agent);
	return [identity, language, style, agentBlock(agent), ...(skills ? [skills] : []), boundary].join('\n');
}
