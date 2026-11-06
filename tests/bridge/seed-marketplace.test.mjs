// The marketplace seed wrote https://localhost:300x as every app's website and launch URL, and
// production's Whiteboard header showed "localhost:3007" on the tailnet (2026-11-04). The URLs
// now come from the deployment's own variables, and an unset one stays empty. Its plain-text
// fields held HTML entities ("&amp;"), which the header printed literally.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const SEED = new URL('../../scripts/seed-marketplace.mjs', import.meta.url).pathname;
const URL_VARS = ['VITE_MAIL_APP_URL', 'PUBLIC_MAIL_ORIGIN', 'VITE_CALENDAR_APP_URL', 'PUBLIC_CALENDAR_ORIGIN',
	'VITE_WHITEBOARD_APP_URL', 'OSIONOS_WHITEBOARD_ORIGIN', 'OSIONOS_APP_URL', 'PUBLIC_OSIONOS_APP_URL'];

function seed(env = {}) {
	const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !URL_VARS.includes(key)));
	return execFileSync(process.execPath, [SEED], { env: { ...base, ...env }, encoding: 'utf8' });
}

/** The `properties` JSON of the app page with this identifier. */
function appProps(sql, identifier) {
	for (const [, json] of sql.matchAll(/\$j\$(\[.*?\])\$j\$::jsonb/g)) {
		const props = JSON.parse(json);
		if (props.some((prop) => prop.key === 'identifier' && prop.value === identifier)) return Object.fromEntries(props.map((prop) => [prop.key, prop.value]));
	}
	throw new Error(`no app ${identifier} in the seed`);
}

describe('marketplace seed', () => {
	it('writes no localhost URL when no app URL is configured, and leaves the fields empty', () => {
		const sql = seed();
		assert.equal(/localhost|127\.0\.0\.1/.test(sql), false, sql.match(/.{40}localhost.{20}/)?.[0]);
		for (const identifier of ['osionos.mail', 'osionos.calendar', 'osionos.desktop', 'osionos.whiteboard']) {
			const props = appProps(sql, identifier);
			assert.deepEqual([props.website, props.launchUrl, props.resources], ['', '', []], identifier);
		}
	});

	it('takes each app URL from the variable the deployment already sets', () => {
		const sql = seed({
			VITE_MAIL_APP_URL: 'https://mail.example.net',
			PUBLIC_CALENDAR_ORIGIN: 'https://calendar.example.net',
			OSIONOS_WHITEBOARD_ORIGIN: 'https://board.example.net/',
			OSIONOS_APP_URL: 'https://app.example.net:8443',
		});
		assert.deepEqual([appProps(sql, 'osionos.mail').website, appProps(sql, 'osionos.mail').launchUrl], ['https://mail.example.net', 'https://mail.example.net']);
		assert.equal(appProps(sql, 'osionos.calendar').launchUrl, 'https://calendar.example.net');
		assert.equal(appProps(sql, 'osionos.whiteboard').website, 'https://board.example.net');
		assert.equal(appProps(sql, 'osionos.desktop').launchUrl, 'https://app.example.net:8443');
	});

	it('ignores a value that is not an http(s) URL (the desktop build sets app://osionos)', () => {
		assert.equal(appProps(seed({ OSIONOS_APP_URL: 'app://osionos' }), 'osionos.desktop').launchUrl, '');
	});

	it('stores plain text with real characters, never HTML entities', () => {
		const sql = seed();
		assert.equal(/&(amp|lt|gt|quot|#\d+);/.test(sql), false, sql.match(/.{30}&(amp|lt|gt|quot|#\d+);.{10}/)?.[0]);
		assert.match(appProps(sql, 'osionos.whiteboard').shortDescription, /sketch, diagram & plan/);
	});
});
