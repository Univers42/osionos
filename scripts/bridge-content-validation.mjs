// The server decides what a stored page or database looks like (#244): a bad write
// answered 200 and only failed when someone opened the page, possibly much later.
//
// Caveat: this checks shape, not the block vocabulary. An unknown `type` with a sound
// shape is accepted on purpose: an allowlist would refuse every save of a page written
// by a newer client, or holding a retired type, and lose the edit. Fields specific to a
// block type are not checked either, `diagramSpec.kind` being the one exception.

const DIAGRAM_KINDS = new Set(['mermaid', 'schema', 'graph', 'hierarchy', 'pipeline']);
const MAX_BLOCK_DEPTH = 64;
const STATE_TABLES = ['databases', 'pages', 'views'];
const RAW_CSS_CLASSES_RE = /\b(?:bg|text|dark|hover|px|py|border)-[a-z0-9_-]+/i;

function refuse(path, reason) {
	throw Object.assign(new Error(`${path} ${reason}`), { status: 422 });
}

function isPlainObject(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNoPresentationStyles(value, path, label = 'value') {
	if (typeof value === 'string' && RAW_CSS_CLASSES_RE.test(value)) {
		refuse(path, `must be a semantic ${label}, not raw CSS classes.`);
	}
}

function assertBlock(block, path, depth) {
	if (!isPlainObject(block)) refuse(path, 'must be a block object.');
	if (typeof block.type !== 'string' || !block.type) refuse(`${path}.type`, 'must be a non-empty string.');
	const { content, children, diagramSpec, type, color, calloutTone } = block;
	if (content !== undefined && content !== null && typeof content !== 'string') refuse(`${path}.content`, 'must be a string.');
	if (color !== undefined && color !== null) {
		assertNoPresentationStyles(color, `${path}.color`, 'value');
	}
	if (calloutTone !== undefined && calloutTone !== null) {
		assertNoPresentationStyles(calloutTone, `${path}.calloutTone`, 'tone');
	}
	if (type === 'diagram' && diagramSpec != null && !DIAGRAM_KINDS.has(diagramSpec.kind)) {
		refuse(`${path}.diagramSpec.kind`, `must be one of ${[...DIAGRAM_KINDS].join(', ')}.`);
	}
	if (children === undefined || children === null) return;
	if (!Array.isArray(children)) refuse(`${path}.children`, 'must be an array.');
	if (depth >= MAX_BLOCK_DEPTH) refuse(`${path}.children`, `nests deeper than ${MAX_BLOCK_DEPTH} levels.`);
	children.forEach((child, index) => assertBlock(child, `${path}.children[${index}]`, depth + 1));
}

/** The page body to store, or a 422 naming the first bad field. */
export function validatedPageContent(value) {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) refuse('content', 'must be an array of blocks.');
	value.forEach((block, index) => assertBlock(block, `content[${index}]`, 0));
	return value;
}

/** The database slice to store, or a 422: it holds databases, pages and views. */
export function validatedDatabaseState(value) {
	if (!isPlainObject(value)) refuse('state', 'must be an object.');
	const tables = STATE_TABLES.filter((name) => name in value);
	if (tables.length === 0) refuse('state', `must hold ${STATE_TABLES.join(', ')}.`);
	for (const name of tables) if (!isPlainObject(value[name])) refuse(`state.${name}`, 'must be an object.');
	if (isPlainObject(value.databases)) {
		for (const [dbId, db] of Object.entries(value.databases)) {
			if (isPlainObject(db) && isPlainObject(db.properties)) {
				for (const [propId, prop] of Object.entries(db.properties)) {
					if (isPlainObject(prop) && Array.isArray(prop.options)) {
						prop.options.forEach((opt, idx) => {
							if (isPlainObject(opt) && opt.color !== undefined && opt.color !== null) {
								assertNoPresentationStyles(
									opt.color,
									`state.databases.${dbId}.properties.${propId}.options[${idx}].color`,
									'color name'
								);
							}
						});
					}
				}
			}
		}
	}
	return value;
}
