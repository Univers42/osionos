// The HTTP edge both IDE servers share: JSON replies, the CORS preflight and the exact-origin router
// in front of the route handlers. One copy, so the relay and ide-server cannot drift on what a
// foreign Origin gets.

const PREFLIGHT_MAX_AGE_SECONDS = '600';

export function sendJson(response, status, body) {
	response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
	response.end(JSON.stringify(body));
}

export function sendPreflight(response, allowedOrigin) {
	response.writeHead(204, {
		'access-control-allow-origin': allowedOrigin,
		'access-control-allow-methods': 'GET, POST, DELETE',
		'access-control-allow-headers': 'authorization, content-type',
		'access-control-max-age': PREFLIGHT_MAX_AGE_SECONDS,
		vary: 'Origin',
	});
	response.end();
}

/** Refuse a foreign Origin, answer the preflight, then give each handler a turn (first to return
 *  true owns the request). `ctx` is `{ allowedOrigin, requestConfig, handlers }`. */
export async function routeIdeApi(url, request, response, ctx) {
	const origin = request.headers.origin;
	if (origin !== undefined && origin !== ctx.allowedOrigin) {
		sendJson(response, 403, { ok: false, message: 'Origin not allowed.' });
		return;
	}
	if (request.method === 'OPTIONS') {
		if (origin === ctx.allowedOrigin) sendPreflight(response, ctx.allowedOrigin);
		else sendJson(response, 404, { ok: false });
		return;
	}
	for (const handler of ctx.handlers) {
		if (await handler(url, request, response, ctx.requestConfig)) return;
	}
	sendJson(response, 404, { ok: false });
}
