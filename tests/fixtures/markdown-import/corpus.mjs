// The Markdown corpus of osionos#240: the parity test (bundle vs TypeScript source,
// M240-10) and the parse-time bench (M240-4) read the same documents.
// SHAPES are the 37 adversarial shapes of the devil ruling's audit (scratch md240 bench,
// shapes.mjs), each a function of a target length in characters.
// Caveat: the shapes and the fuzz tokens are the shapes someone thought of; a
// super-linear path no generator produces is not covered (ruling, "Not known").

const rep = (unit, n) => unit.repeat(Math.max(1, Math.floor(n / unit.length)));

export const SHAPES = {
	lt_then_gt: (n) => rep('<', n) + '>',
	lt_a: (n) => rep('<a', n),
	email_like: (n) => rep('<a@b.c ', n),
	link_open: (n) => rep('[a](', n),
	brackets: (n) => rep('[', n),
	bang_brackets: (n) => rep('![', n),
	star_a: (n) => rep('*a ', n),
	under_a: (n) => rep('_a', n),
	dstar_a: (n) => rep('**a', n),
	eq_a: (n) => rep('==a', n),
	tilde_a: (n) => rep('~~a', n),
	ticks_mixed: (n) => rep('``a`', n),
	backslash: (n) => rep('\\', n),
	colon_run: (n) => ':' + rep('a', n),
	dollar_a: (n) => rep('$a$$', n),
	dbl_bracket: (n) => rep('[[', n),
	curly: (n) => rep('{{', n),
	html_b_open: (n) => rep('<b>', n),
	html_span_open: (n) => rep('<span style="x">', n),
	link_title_spaces: (n) => '[a](x' + rep(' ', n) + 'y)',
	link_title_quote: (n) => '[a](x' + rep(' ', n) + '"t"y)',
	heading_ws_cr: (n) => '# a' + rep(' ', n) + '\rx',
	heading_ws: (n) => '# a' + rep(' ', n) + 'x',
	table_sep_ws: (n) => 'a|b\n---' + rep(' ', n) + 'x',
	table_lines: (n) => rep('a|b\n', n),
	quote_nest: (n) => rep('> ', n) + 'x',
	list_nest_same_line: (n) => rep('- ', n) + 'x',
	list_indent_stair: (n) => {
		let text = '';
		for (let depth = 0; text.length < n; depth++) text += ' '.repeat(depth * 2) + '- x\n';
		return text;
	},
	quote_lines: (n) => rep('> a\n', n),
	footnote_defs: (n) => rep('[^a]: b\n', n),
	ref_defs_and_uses: (n) => rep('[a]: http://x\n', n / 2) + rep('[a] ', n / 2),
	container_fences: (n) => rep('::: columns\n', n),
	fence_open_lines: (n) => rep('```\n', n),
	setext_after_quote: (n) => rep('>x\n===\n', n),
	cr_quote_blank: (n) => rep('> a\r\n>\r\n', n),
	para_lines_pipe: (n) => rep('x|y\nz\n', n),
	long_para_one_line: (n) => rep('word ', n),
};

/** Documents a user writes, one per block family, plus the ruling's edge cases. */
export const DOCUMENTS = {
	empty: '',
	headings: '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n\nSetext\n===\n',
	inline_marks: 'Plain **bold** *italic* ~~strike~~ ==mark== `code` and [a link](https://example.com "t").\n',
	lists: '- a\n- b\n  - nested\n    - deeper\n\n1. one\n2. two\n\n- [ ] todo\n- [x] done\n',
	quote_callout: '> quoted\n> lines\n\n> [!note]\n> a callout\n',
	code_fences: '```js\nconst x = 1;\n```\n\n~~~\nplain\n~~~\n',
	table: '| a | b |\n|:--|--:|\n| 1 | 2 |\n| 3 | 4 |\n',
	math: 'Inline $x^2$ and\n\n$$\n\\int_0^1 x\\,dx\n$$\n',
	footnotes: 'Text[^1] more.\n\n[^1]: The note.\n',
	reference_links: '[ref]: https://example.com\n\nSee [ref] and [text][ref].\n',
	images: '![alt](https://example.com/a.png)\n\n![](/media/other-workspace/x.png)\n',
	html_block: '<div class="x">\n<b>bold</b>\n</div>\n',
	divider: 'above\n\n---\n\nbelow\n',
	columns: '::: columns\n::: column\nleft\n:::\n::: column\nright\n:::\n:::\n',
	osi_button: '```osibutton\n{"label":"Go","actions":[]}\n```\n',
	osi_invalid_json: '```osidb\n{not json\n```\n',
	osi_embed_bad_snapshot: '```osiembed\n{"content":"https://example.com","embed":{"kind":"x"},"embedHeight":"tall"}\n```\n',
	fence_unclosed: '```python\nprint(1)\nno closing marker\n',
	nesting_depth_33: '>'.repeat(33) + ' deep\n\n' + Array.from({ length: 33 }, (_, depth) => `${'  '.repeat(depth)}- level ${depth}`).join('\n'),
	javascript_link: '[click](javascript:alert(1)) and <javascript:alert(2)>\n',
	data_link: '[img](data:text/html;base64,PHNjcmlwdD4=)\n',
	bom: '\uFEFF# Title after a BOM\n',
	crlf: '# CRLF\r\n\r\n- a\r\n- b\r\n',
	lone_cr: '# lone\rCR\r\rtext\r',
	line_separators: 'a\u2028b\u2029c\n',
	nul_and_c0: 'nul\u0000 bell\u0007 esc\u001b text\n',
	emoji_wiki: ':smile: [[page:abc]] {{variable}} @mention\n',
	mixed_document: '# Plan\n\nIntro with **marks**.\n\n- step one\n- step two\n\n| k | v |\n|---|---|\n| a | 1 |\n\n```sh\necho hi\n```\n\n> done\n',
};

/** The parity corpus: every document plus every shape at 256 characters. */
export function parityCorpus() {
	const shapes = Object.entries(SHAPES).map(([name, make]) => [`shape:${name}`, make(256)]);
	return [...Object.entries(DOCUMENTS), ...shapes];
}

const FUZZ_TOKENS = ['#', '# ', '##', ' ', '  ', '    ', '\t', '\n', '\r\n', '\r', '>', '> ', '- ', '* ', '+ ', '1. ', '1) ', '[ ] ',
	'[x] ', '`', '```', '~~~', '$', '$$', '*', '**', '_', '__', '~~', '==', '[', ']', '(', ')', '![', '<', '<div>', '</div>', '<b>',
	'<span>', '|', '---', '===', ':::', '::: columns', '[^a]', '[^a]: ', '[a]: http://x', ':smile:', '\\', '"', 'http://a.b',
	'javascript:alert(1)', 'a', 'word', '{{x}}', '[[page:', '> [!note]', '@', '.'];

/** A seeded document of about `length` characters drawn from the fuzz tokens (same LCG as the ruling's fuzz.mjs). */
export function fuzzDocument(seedState, length) {
	let text = '';
	while (text.length < length) {
		seedState.seed = (seedState.seed * 1103515245 + 12345) & 0x7fffffff;
		text += FUZZ_TOKENS[seedState.seed % FUZZ_TOKENS.length];
	}
	return text;
}
