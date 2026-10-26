import { attributeText, quotedData } from '../runs/sources.ts';
import { TOOL_OUTPUT_CHARS } from '../tools/loop.ts';

/**
 * What an MCP server said, as the model may read it (C273).
 *
 * The words of a third party reach the model only inside a fixed block, with
 * the angle brackets and ampersands of the body turned into entities: the
 * body can say `</mcp_output>` and it is still text. The block is cut to the
 * output ceiling of a tool, and it is never HTML.
 *
 * Caveat: the entities stop the body from being markup, not from being
 * persuasive. A model can still be talked into things by text it reads; the
 * block says it is data, and the approval card of any later write says the
 * run was influenced by this server (C286).
 */

export const NON_TEXT_DROPPED = '[non-text content was dropped]';

export function wrapOutput(serverLabel: string, toolName: string, text: string, droppedNonText: boolean): string {
	// A cut in the middle of an entity would leave a stray "&am".
	const body = quotedData(text).slice(0, TOOL_OUTPUT_CHARS).replace(/&[a-z]*$/u, '');
	const dropped = droppedNonText ? `\n${NON_TEXT_DROPPED}` : '';
	return `<mcp_output server="${attributeText(serverLabel)}" tool="${attributeText(toolName)}">\n${body}${dropped}\n</mcp_output>`;
}
