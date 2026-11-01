/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-cors-origin.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Many bridge modules are built once with the static config (bridge-perms even reads its own
 * env), so their replies name the bridge's default origin. A desktop (app://osionos) or
 * localhost caller then has those replies discarded by the browser: Settings, AI connections
 * and sharing showed "Failed to fetch" in the desktop app (2026-10-30, live bridge). The server
 * entry wraps each response so the origin header is the one allowed for this request,
 * whichever module writes it.
 */
const isOriginHeader = (name) => String(name).toLowerCase() === 'access-control-allow-origin';

export function answerWithOrigin(response, origin) {
	const setHeader = response.setHeader.bind(response);
	response.setHeader = (name, value) => setHeader(name, isOriginHeader(name) ? origin : value);
	const writeHead = response.writeHead.bind(response);
	response.writeHead = (status, ...rest) => {
		for (const headers of rest) {
			if (!headers || typeof headers !== 'object' || Array.isArray(headers)) continue;
			for (const name of Object.keys(headers)) if (isOriginHeader(name)) headers[name] = origin;
		}
		return writeHead(status, ...rest);
	};
}
