/**
 * The block types a page may carry.
 *
 * The list is the one of the MCP server (scripts/osionos-mcp-server.mjs:57):
 * a block the app cannot draw is a block the page must not carry. The server
 * does not export it — it is a local constant of a stdio server — so the list
 * lives here, once, and the write tools read it.
 */
export const BLOCK_TYPES = [
	'paragraph',
	'heading_1',
	'heading_2',
	'heading_3',
	'heading_4',
	'heading_5',
	'heading_6',
	'bulleted_list',
	'numbered_list',
	'to_do',
	'toggle',
	'image',
	'video',
	'audio',
	'file',
	'code',
	'quote',
	'callout',
	'equation',
	'layout',
	'column_list',
	'column',
	'divider',
	'table_block',
	'database_inline',
	'database_full_page',
] as const;

/**
 * The language a code block may name. Lowercase, because the editor matches it
 * exactly (`RENDERABLE_LANGUAGES.has(language)`): `mermaid` draws a diagram.
 */
export const CODE_LANGUAGE = /^[a-z0-9][a-z0-9+#._-]{0,31}$/;

/**
 * The block types the assistant may add to a page that already exists: text only.
 *
 * An image, a video, a file or an embedded database carries a URL, and a block
 * that renders a URL on open is a way out of a private page that needs no
 * click (devil C233). The assistant writes words; the user adds the media.
 */
export const TEXT_BLOCK_TYPES = [
	'paragraph',
	'heading_1',
	'heading_2',
	'heading_3',
	'heading_4',
	'heading_5',
	'heading_6',
	'bulleted_list',
	'numbered_list',
	'to_do',
	'toggle',
	'code',
	'quote',
	'callout',
] as const;
