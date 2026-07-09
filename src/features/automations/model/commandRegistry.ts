import { APP_COMMANDS } from "./commands/appCommands";
import { CLIPBOARD_COMMANDS } from "./commands/clipboardCommands";
import { EDITING_COMMANDS } from "./commands/editingCommands";
import { FORMAT_COMMANDS } from "./commands/formatCommands";
import type { Command, CommandId } from "./types";

/** Every runnable command a keyboard automation can trigger (the action vocabulary). */
export const ALL_COMMANDS: Command[] = [
  ...EDITING_COMMANDS,
  ...CLIPBOARD_COMMANDS,
  ...FORMAT_COMMANDS,
  ...APP_COMMANDS,
];

export const commandById: Record<string, Command> = Object.fromEntries(
  ALL_COMMANDS.map((command) => [command.id, command]),
);

export function commandTitle(id: CommandId): string {
  return commandById[id]?.title ?? id;
}
