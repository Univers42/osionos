import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractLinks, MAX_LINKS } from '../src/web/links.ts';

describe('web C348 the links of a page', () => {
	it('C348 relative links resolve against the final URL, fragments drop, duplicates merge, order is kept', () => {
		const links = extractLinks(['/a', 'b#top', '../c', 'https://other.test/x#y', '/a', ' /a '], 'https://site.test/dir/page');
		assert.deepEqual(links, ['https://site.test/a', 'https://site.test/dir/b', 'https://site.test/c', 'https://other.test/x']);
	});

	it('C348 javascript:, data:, mailto:, http: and file: links are dropped', () => {
		const hrefs = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'mailto:a@b.test', 'http://site.test/x', 'file:///etc/passwd', 'ftp://site.test/'];
		assert.deepEqual(extractLinks(hrefs, 'https://site.test/'), []);
	});

	it('C348 //host on an http base is http and is dropped; on an https base it is https', () => {
		assert.deepEqual(extractLinks(['//other.test/x'], 'http://site.test/'), []);
		assert.deepEqual(extractLinks(['//other.test/x'], 'https://site.test/'), ['https://other.test/x']);
	});

	it('C348 userinfo tricks, literal addresses, other ports and internal names are dropped', () => {
		const hrefs = [
			'https://user:pw@site.test/',
			'https://site.test@evil.test/',
			'https://good.test:pw@evil.test/',
			'https://127.0.0.1/',
			'https://[::1]/',
			'https://2130706433/',
			'https://site.test:8443/',
			'https://intranet/',
			'https://printer.local/',
		];
		assert.deepEqual(extractLinks(hrefs, 'https://site.test/'), []);
	});

	it('C348 a <base> is not an input: only the final URL resolves a link', () => {
		// htmlToText never reports a <base>; the same holds for a base-looking href.
		assert.deepEqual(extractLinks(['x'], 'https://real.test/dir/'), ['https://real.test/dir/x']);
	});

	it('C348 at most 30 links are returned', () => {
		const hrefs = Array.from({ length: 100 }, (_value, index) => `/p${index}`);
		const links = extractLinks(hrefs, 'https://site.test/');
		assert.equal(MAX_LINKS, 30);
		assert.equal(links.length, 30);
		assert.equal(links[29], 'https://site.test/p29');
	});

	it('C348 an unusable final URL gives no links, and junk hrefs do not throw', () => {
		assert.deepEqual(extractLinks(['/a'], 'not a url'), []);
		assert.deepEqual(extractLinks(['', '   ', 'http://', 'https://', 'https://exa mple.test/'], 'https://site.test/'), []);
	});
});
