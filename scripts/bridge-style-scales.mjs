// The style scales the bridge accepts on a published block (ADR 0064 PS39). Copied from
// STYLE_SCALES and PROP_SCALE in src/entities/block/model/blockStyle.ts because the bridge
// image runs plain node and cannot import that TypeScript; tests/canvas/publish-style-drift.test.ts
// fails when the two differ. Change both together.

export const STYLE_SCALES = {
	tone: ['default', 'primary', 'subtle', 'ghost', 'danger', 'danger-subtle', 'success', 'warning', 'accent'],
	size: ['sm', 'md', 'lg'],
	text: ['default', 'muted', 'subtle', 'accent', 'danger', 'success', 'warning', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'],
	surface: ['default', 'muted', 'subtle', 'accent', 'danger', 'success', 'warning', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'],
	border: ['none', 'subtle', 'default', 'strong', 'danger', 'accent'],
	borderSides: ['all', 'top', 'bottom', 'x', 'y'],
	radius: ['none', 'sm', 'md', 'panel', 'lg', 'full'],
	space: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
	width: ['hug', 'fill', 'fixed'],
	align: ['start', 'center', 'end', 'stretch'],
	justify: ['start', 'center', 'end', 'between'],
	textSize: ['xs', 'sm', 'base', 'lg', 'xl'],
	weight: ['regular', 'medium', 'semibold'],
	shadow: ['none', 'menu', 'panel'],
	// Container modes of a column_list, and a column's span in a grid (ADR 0064 PS6).
	layout: ['row', 'stack', 'grid'],
	wrap: ['nowrap', 'wrap'],
	cols: [1, 2, 3, 4, 5, 6],
	minCol: [10, 12, 16, 20],
	stackAt: ['tablet', 'mobile', 'never'],
};

export const PROP_SCALE = {
	tone: 'tone',
	size: 'size',
	text: 'text',
	surface: 'surface',
	border: 'border',
	borderSides: 'borderSides',
	radius: 'radius',
	padding: 'space',
	paddingX: 'space',
	paddingY: 'space',
	gap: 'space',
	width: 'width',
	fixedWidth: 'space',
	basis: 'space',
	align: 'align',
	justify: 'justify',
	textSize: 'textSize',
	weight: 'weight',
	shadow: 'shadow',
	layout: 'layout',
	wrap: 'wrap',
	cols: 'cols',
	minCol: 'minCol',
	stackAt: 'stackAt',
	span: 'cols',
};

/** A style holding only own keys that name a scale and values on that scale. Drops the rest silently. */
export function sanitizeStyle(input) {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) return {};
	const out = {};
	for (const [key, value] of Object.entries(input)) {
		if (!Object.hasOwn(PROP_SCALE, key)) continue;
		if (STYLE_SCALES[PROP_SCALE[key]].includes(value)) out[key] = value;
	}
	return out;
}
