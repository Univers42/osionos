/**
 * The built-in commands: the actions the user triggers, in the editor and in
 * the chat.
 *
 * The shape is opencode's command schema, so the client reads the same fields
 * it knows. The templates use $ARGUMENTS, which receives the selected text or
 * the typed arguments.
 *
 * The list is frozen and lives in the code: there is no table behind it in P1.
 */

/** Where a command may be offered. "both" answers either surface. */
export type CommandSurface = 'editor' | 'chat' | 'both';

/** The surface a client asks for. */
export type CommandSurfaceFilter = 'editor' | 'chat';

export interface Command {
	name: string;
	description: string;
	template: string;
	surface: CommandSurface;
	/** The model the command asks for, when it pins one. */
	model?: string;
}

/** The last line of every template: the answer, and nothing else. */
const REPLY_ONLY = 'Reply with the result only.';

/** The ten built-ins, in the order of the wire contract. */
const BUILTINS: readonly Command[] = Object.freeze([
	{
		name: 'ask',
		description: 'Answer a question about the selection',
		template: `Answer the instruction about the following text.\n\n$ARGUMENTS\n\n${REPLY_ONLY}`,
		surface: 'both',
	},
	{
		name: 'summarize',
		description: 'Summarize the selection in 3–5 sentences',
		template: `Summarize the following text in 3–5 sentences.\n\n$ARGUMENTS\n\n${REPLY_ONLY}`,
		surface: 'both',
	},
	{
		name: 'continue',
		description: 'Continue writing in the same voice',
		template: `Continue writing the following text in the same voice, in 1–2 paragraphs.\n\n$ARGUMENTS\n\n${REPLY_ONLY}`,
		surface: 'editor',
	},
	{
		name: 'improve',
		description: 'Rewrite the selection more clearly',
		template: `Rewrite the following text more clearly, keeping its meaning.\n\n$ARGUMENTS\n\n${REPLY_ONLY}`,
		surface: 'editor',
	},
	{
		name: 'fix',
		description: 'Fix the spelling and the grammar',
		template: `Fix the spelling and the grammar of the following text, and nothing else.\n\n$ARGUMENTS\n\n${REPLY_ONLY}`,
		surface: 'editor',
	},
	{
		name: 'shorter',
		description: 'Make the selection shorter',
		template: `Make the following text shorter.\n\n$ARGUMENTS\n\n${REPLY_ONLY}`,
		surface: 'editor',
	},
	{
		name: 'longer',
		description: 'Make the selection longer',
		template: `Make the following text longer.\n\n$ARGUMENTS\n\n${REPLY_ONLY}`,
		surface: 'editor',
	},
	{
		name: 'translate',
		description: 'Translate the selection into another language',
		template: `Translate the following text into the language named first in the arguments.\n\n$ARGUMENTS\n\n${REPLY_ONLY}`,
		surface: 'both',
	},
	{
		name: 'action-items',
		description: 'List the action items of the selection',
		template: `Output a checklist of the action items in the following text.\n\n$ARGUMENTS\n\n${REPLY_ONLY}`,
		surface: 'both',
	},
	{
		name: 'explain',
		description: 'Explain the selection simply',
		template: `Explain the following text simply.\n\n$ARGUMENTS\n\n${REPLY_ONLY}`,
		surface: 'both',
	},
]);

/**
 * The commands of a surface. A command on "both" answers either one; without
 * a surface, every command answers.
 */
export function builtinCommands(surface?: CommandSurfaceFilter): readonly Command[] {
	if (!surface) return BUILTINS;
	return BUILTINS.filter((command) => command.surface === surface || command.surface === 'both');
}

/** The command of that name, or null when there is none. */
export function findCommand(name: string): Command | null {
	const asked = name.trim();
	return BUILTINS.find((command) => command.name === asked) ?? null;
}

/**
 * The template with the arguments in it: EVERY $ARGUMENTS is replaced, so a
 * template that mentions the selection twice gets it twice.
 *
 * Pure: the same template and the same arguments always give the same text.
 */
export function renderTemplate(template: string, args: string): string {
	return template.replaceAll('$ARGUMENTS', args);
}
