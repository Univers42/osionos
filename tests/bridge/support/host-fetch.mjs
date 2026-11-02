// A fetch that sends a chosen Host header. The node answers only requests naming its own origin's
// host:port (devil verdict 2026-11-01, W1), and Node's fetch always rewrites Host to the address it
// dials, so a test whose IDE origin is not that address goes through http.request instead.
import http from 'node:http';

function request(url, { method = 'GET', headers = {}, body } = {}) {
	return new Promise((resolve, reject) => {
		// The path is sent as written: new URL() would resolve `..` before the node ever saw it.
		const { origin, hostname, port } = new URL(url);
		const req = http.request({ hostname, port, path: url.slice(origin.length) || '/', method, headers }, (res) => {
			const chunks = [];
			res.on('data', (chunk) => chunks.push(chunk));
			res.on('end', () => {
				const text = Buffer.concat(chunks).toString('utf8');
				const read = (name) => {
					const value = res.headers[name.toLowerCase()];
					return value === undefined ? null : [].concat(value).join(', ');
				};
				resolve({ status: res.statusCode, headers: { get: read }, text: async () => text, json: async () => JSON.parse(text) });
			});
		});
		req.on('error', reject);
		req.end(body);
	});
}

/** `fetch` for each server registered with `bind(base, ideOrigin)` sends that origin's host. */
export function createHostedFetch() {
	const hosts = new Map();
	const hostOf = (base) => hosts.get(new URL(base).origin) ?? new URL(base).host;
	return {
		bind(base, ideOrigin) { hosts.set(new URL(base).origin, new URL(ideOrigin).host); },
		hostOf,
		fetch: (url, init = {}) => request(url, { ...init, headers: { host: hostOf(url), ...init.headers } }),
	};
}
