// An owner page that mixes what today's snapshot keeps with what Phase 7 adds: columns, a
// style on blocks and columns, and cover fields that must never reach a public copy (PH3).
const text = (id, content, extra = {}) => ({ id, type: 'paragraph', content, ...extra });
const column = (id, children, extra = {}) => ({ id, type: 'column', content: '', children, ...extra });

export const OWNER_PAGE = [
	{ id: 'h', type: 'heading_1', content: 'Title', textColor: 'red' },
	text('styled', 'Padded', { style: { padding: 3, surface: 'muted', bogus: 1, constructor: 'x' }, cover_height: 300, cover_width: 'wide', cover: 'asset-9' }),
	{ id: 'cl', type: 'column_list', content: '', style: { layout: 'grid', cols: 3, gap: 4, minCol: 99 }, cover_height: 120, children: [
		column('c1', [text('c1p', 'Left, **bold**')], { style: { span: 2 }, widthRatio: 0.3 }),
		column('c2', [text('c2p', 'Right [x](page://aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee)')]),
	] },
	{ id: 'tail', type: 'quote', content: 'End' },
];
