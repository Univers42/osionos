import type { ContextItem } from '../context/repo.ts';
import { builtinCommands } from './builtins.ts';
import type { Command } from './builtins.ts';

/**
 * A user's own slash commands (U2, OSIONOS_AI_USER_COMMANDS): ai_context_items
 * rows of kind 'command', the slug the name, the body the template.
 *
 * The composer expands a template into the message the user sends; the service
 * never reads one into a prompt. So a user command is served on the chat
 * surface only (C1104): the editor would run it on a selection the user did
 * not type.
 */

/**
 * The composer's actions (front src/features/ai/model/chatCommands.ts
 * CHAT_ACTIONS): an action wins a clash in the palette, so a command of that
 * name could never be picked. tests/userCommands.test.ts reads the front file
 * and fails when an action is missing here (C1105).
 */
export const COMPOSER_ACTION_NAMES: readonly string[] = Object.freeze([
	'new', 'model', 'agent', 'context', 'effort', 'attach', 'skills', 'memory', 'mcp', 'hub', 'routing', 'help',
]);

/** The names a user command may not take: every built-in and every composer action. */
export const RESERVED_COMMAND_NAMES: ReadonlySet<string> = new Set([
	...builtinCommands().map((command) => command.name),
	...COMPOSER_ACTION_NAMES,
]);

/**
 * Why a template is refused, or null. One $ARGUMENTS at most (C1109): the
 * expansion is then the template (6000) plus what the user typed, so it stays
 * under the run's 32 000 characters unless the typing alone would not.
 */
export function templateProblem(template: string): 'command_template' | null {
	return template.split('$ARGUMENTS').length > 2 ? 'command_template' : null;
}

/**
 * The user's commands as the registry serves them. A name a built-in took
 * after the command was written is left out: a built-in is never shadowed.
 */
export function toUserCommands(items: readonly ContextItem[]): Command[] {
	return items
		.filter((item) => item.kind === 'command' && !RESERVED_COMMAND_NAMES.has(item.slug))
		.map((item) => ({ name: item.slug, description: item.description, template: item.body, surface: 'chat' }));
}
