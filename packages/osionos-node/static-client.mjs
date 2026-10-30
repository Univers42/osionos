/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   static-client.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Serves the built IDE page (dist-ide) on the IDE origin (devil verdict 2026-10-30, C9, C0-F2).
// The document carries an enforced CSP with no inline script, and only the exact app origin may
// frame it. Only `/` and files directly under assets/ exist; every other path is a 404.
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { extname, join } from 'node:path';

const TYPES = {
	'.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm',
	'.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};
// One flat name: Vite writes hashed files straight into assets/ (Rollup helpers start with `_`),
// so a slash, a dot-name or a dot-dot is never a real asset.
const ASSET = /^\/assets\/([A-Za-z0-9_][A-Za-z0-9._-]*)$/;

// 'wasm-unsafe-eval' is the TextMate grammar engine (oniguruma); 'unsafe-inline' is for styles
// only, which the library injects at run time. Built-in extensions fetch their manifests as
// data: URLs (measured: theme-defaults). Open VSX is the extension gallery.
function documentCsp(appOrigin) {
	return [
		"default-src 'none'", "script-src 'self' 'wasm-unsafe-eval'", "worker-src 'self' blob:", "style-src 'self' 'unsafe-inline'",
		"font-src 'self' data:", "img-src 'self' data: blob: https://open-vsx.org", "connect-src 'self' data: https://open-vsx.org",
		"frame-src 'self'", "base-uri 'none'", "form-action 'none'", `frame-ancestors ${appOrigin}`,
	].join('; ');
}

function exactOrigin(value) {
	let url;
	try { url = new URL(value); } catch { return null; }
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	return url.origin === value ? value : null;
}

export function createClientHandler({ root, appOrigin }) {
	const origin = exactOrigin(appOrigin);
	if (!origin) throw new Error(`app origin must be a bare http(s) origin: ${JSON.stringify(appOrigin)}`);
	const page = () => readFileSync(join(root, 'index.html'), 'utf8').replaceAll('%OSIONOS_APP_ORIGIN%', origin);

	return function serveClient(req, res) {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405, { 'content-type': 'text/plain' });
			return res.end('Method not allowed.');
		}
		const pathname = req.url.split('?')[0];
		if (pathname === '/' || pathname === '/index.html') {
			res.writeHead(200, {
				'content-type': 'text/html; charset=utf-8', 'content-security-policy': documentCsp(origin),
				'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
			});
			return res.end(req.method === 'HEAD' ? undefined : page());
		}
		const name = ASSET.exec(pathname)?.[1];
		const file = name && join(root, 'assets', name);
		let size = -1;
		try { if (file) size = statSync(file).isFile() ? statSync(file).size : -1; } catch { /* missing */ }
		if (size < 0) {
			res.writeHead(404, { 'content-type': 'text/plain' });
			return res.end('Not found.');
		}
		res.writeHead(200, {
			'content-type': TYPES[extname(name)] ?? 'application/octet-stream', 'content-length': size,
			'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff',
		});
		if (req.method === 'HEAD') return res.end();
		createReadStream(file).pipe(res);
	};
}
