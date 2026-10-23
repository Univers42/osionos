/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   route-call.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */



// Calls a route handler without a socket: a Readable stands in for the request and a small
// object records the answer. The routes only use writeHead/setHeader/end, so nothing else is
// faked; a test that needs the real HTTP stack uses bridge-harness.mjs instead.

import { Readable } from 'node:stream';

export const BASE = 'http://bridge.test';

export function fakeRequest({ method, body, headers }) {
	const text = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
	const request = Readable.from(text === '' ? [] : [text]);
	request.method = method;
	request.headers = { authorization: 'Bearer test', ...headers };
	return request;
}

export function fakeResponse() {
	const captured = { status: 0, headers: {}, body: null, text: '' };
	return {
		captured,
		setHeader: (name, value) => { captured.headers[name.toLowerCase()] = value; },
		writeHead: (status, headers = {}) => {
			captured.status = status;
			for (const [name, value] of Object.entries(headers)) captured.headers[name.toLowerCase()] = value;
		},
		end: (text) => {
			captured.text = text ?? '';
			captured.body = text ? JSON.parse(text) : null;
		},
	};
}

/** `handler(url, request, response)` → { status, headers, body, text, handled }. */
export async function callRoute(handler, { method = 'GET', path, body, headers = {} }) {
	const response = fakeResponse();
	const handled = await handler(new URL(`${BASE}${path}`), fakeRequest({ method, body, headers }), response);
	return { ...response.captured, handled };
}
