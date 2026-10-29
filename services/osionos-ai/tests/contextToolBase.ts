import { READ_TOOLS } from '../src/tools/readTools.ts';
import { VIEW_TOOLS } from '../src/tools/viewTools.ts';
import { writeTools } from '../src/tools/writeToolList.ts';
import { loadSkillTool } from '../src/tools/skillTools.ts';
import { rememberTool } from '../src/tools/memoryTools.ts';

/** The definitions TOOL_DEFINITION_CHARS counted before U5 (C1141). */
export function baseDefinitions() {
	return [...READ_TOOLS, ...VIEW_TOOLS, ...writeTools(), loadSkillTool([]), rememberTool({ workspaceId: '', runId: '' })];
}
