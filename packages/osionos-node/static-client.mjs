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

// Serves the built IDE page (dist-ide) on the IDE origin (devil verdict 2026-10-30, C9, C0-F2),
// and the web terminal page (build/terminal) under /terminal/ (devil verdict 2026-11-01, W12).
// Each document carries an enforced CSP with no inline script, and only the exact app origins may
// frame it: the web app's, and the desktop app's `app://osionos` (F13). Only each page and the
// files directly under its assets/ exist; every other path is a 404.
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { extname, join } from 'node:path';

const TYPES = {
	'.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm',
	'.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};
// One flat name: Vite writes hashed files straight into assets/ (Rollup helpers start with `_`),
// so a slash, a dot-name or a dot-dot is never a real asset.
const ASSET_NAME = '([A-Za-z0-9_][A-Za-z0-9._-]*)';
const ASSET = new RegExp(`^/assets/${ASSET_NAME}$`);
const TERMINAL_ASSET = new RegExp(`^/terminal/assets/${ASSET_NAME}$`);
const TERMINAL_PAGES = new Set(['/terminal/', '/terminal/index.html']);

// 'wasm-unsafe-eval' is the TextMate grammar engine (oniguruma); 'unsafe-inline' is for styles
// only, which the library injects at run time. Built-in extensions fetch their manifests as
// data: URLs (measured: theme-defaults). Open VSX is the extension gallery.
function documentCsp(appOrigins) {
	return [
		"default-src 'none'", "script-src 'self' 'wasm-unsafe-eval'", "worker-src 'self' blob:", "style-src 'self' 'unsafe-inline'",
		"font-src 'self' data:", "img-src 'self' data: blob: https://open-vsx.org", "connect-src 'self' data: https://open-vsx.org",
		"frame-src 'self'", "base-uri 'none'", "form-action 'none'", `frame-ancestors ${appOrigins.join(' ')}`,
	].join('; ');
}

/** The terminal page's policy (W12): its own origin only, no gallery, no frame, no form. Styles
 *  are injected by VS Code at run time; its icons and font are files of the build. VS Code starts
 *  its own module workers through a blob: bootstrap (measured 2026-11-01, Chromium 156: one
 *  worker-src violation without it), as on the desktop's terminal origin. */
export function terminalCsp(appOrigins) {
	return [
		"default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src 'self' data: blob:", "worker-src 'self' blob:",
		"connect-src 'self'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'", `frame-ancestors ${appOrigins.join(' ')}`,
	].join('; ');
}

// The desktop app's scheme: WHATWG gives a non-special scheme the origin "null", so it is matched
// whole rather than parsed.
const APP_SCHEME_ORIGIN = /^app:\/\/[a-z0-9-]+$/;

function exactOrigin(value) {
	if (APP_SCHEME_ORIGIN.test(value)) return value;
	let url;
	try { url = new URL(value); } catch { return null; }
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	return url.origin === value ? value : null;
}

function notFound(res, headers = {}) {
	res.writeHead(404, { 'content-type': 'text/plain', ...headers });
	res.end('Not found.');
}

function sendDocument(req, res, html, csp) {
	res.writeHead(200, {
		'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp,
		'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
	});
	res.end(req.method === 'HEAD' ? undefined : html);
}

function sendAsset(req, res, dir, name, headers = {}) {
	const file = name && join(dir, 'assets', name);
	let size = -1;
	try { if (file) size = statSync(file).isFile() ? statSync(file).size : -1; } catch { /* missing */ }
	if (size < 0) return notFound(res, headers);
	res.writeHead(200, {
		'content-type': TYPES[extname(name)] ?? 'application/octet-stream', 'content-length': size,
		'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', ...headers,
	});
	if (req.method === 'HEAD') return res.end();
	createReadStream(file).pipe(res);
}

/** `terminalRoot` is the terminal page's build; without one, /terminal/ is a 404 like any path. */
export function createClientHandler({ root, terminalRoot = null, appOrigins }) {
	if (!appOrigins?.length) throw new Error('at least one app origin is required');
	for (const value of appOrigins) {
		if (!exactOrigin(value)) throw new Error(`app origin must be a bare http(s) or app:// origin: ${JSON.stringify(value)}`);
	}
	const page = (dir) => readFileSync(join(dir, 'index.html'), 'utf8').replaceAll('%OSIONOS_APP_ORIGIN%', appOrigins.join(' '));
	const terminalPolicy = { 'content-security-policy': terminalCsp(appOrigins) };

	function serveTerminal(req, res, pathname) {
		if (!terminalRoot) return notFound(res, terminalPolicy);
		if (TERMINAL_PAGES.has(pathname)) return sendDocument(req, res, page(terminalRoot), terminalCsp(appOrigins));
		return sendAsset(req, res, terminalRoot, TERMINAL_ASSET.exec(pathname)?.[1], terminalPolicy);
	}

	return function serveClient(req, res) {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405, { 'content-type': 'text/plain' });
			return res.end('Method not allowed.');
		}
		const pathname = req.url.split('?')[0];
		if (pathname === '/terminal' || pathname.startsWith('/terminal/')) return serveTerminal(req, res, pathname);
		if (pathname === '/' || pathname === '/index.html') return sendDocument(req, res, page(root), documentCsp(appOrigins));
		return sendAsset(req, res, root, ASSET.exec(pathname)?.[1]);
	};
}
