import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { webUrl } from '../src/web/webUrl.ts';

describe('web C341 the URLs the web tools may reach', () => {
	it('C341 refuses http, literal addresses in every spelling, credentials, other ports and internal names', () => {
		const refused = [
			'http://example.com/',
			'https://127.0.0.1/',
			'https://[::1]/',
			'https://[::ffff:7f00:1]/',
			'https://2130706433/',
			'https://0x7f.1/',
			'https://127.0.0.1./',
			'https://8.8.8.8/',
			'https://user:p@example.com/',
			'https://example.com:8443/',
			'https://example.com:80/',
			'https://localhost/',
			'https://localhost./',
			'https://printer.local/',
			'https://db.internal/',
			'https://app.localhost/',
			'https://router.home.arpa/',
			'https://intranet/',
			'file:///etc/passwd',
			'javascript:alert(1)',
			'not a url',
		];
		for (const raw of refused) assert.equal(webUrl(raw), null, `${raw} must be refused`);
	});

	it('C341 keeps a public https URL, drops the fragment and the default port, folds the host case', () => {
		assert.equal(webUrl('https://Example.COM:443/a?b=1#frag')?.href, 'https://example.com/a?b=1');
		assert.equal(webUrl('https://example.com/#f')?.href, 'https://example.com/');
	});
});
