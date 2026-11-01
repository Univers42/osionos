// The code theme every VS Code surface osionos draws shares: its own Monaco, the terminal page
// and the IDE page. Free of `@/` imports: the two pages are built without the app's aliases.

export const SYNTAX_KEYS = ["keyword", "string", "comment", "function", "number", "literal", "property", "type", "tag", "attr"] as const;
export type SyntaxKey = (typeof SYNTAX_KEYS)[number];
