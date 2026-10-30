/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pin.mjs                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One pin for the client library and the VS Code server it talks to. The server refuses a
// client whose commit differs, so a skew must fail a test, never a user's session.
import { readFileSync } from 'node:fs';

export const SERVER_PIN = JSON.parse(readFileSync(new URL('./server-pin.json', import.meta.url), 'utf8'));

// `monaco-editor` and `vscode` count only as aliases of the library; the app's upstream
// monaco-editor (code pages, until Phase 2) is another editor and is not pinned here.
const isClientPackage = ([name, spec]) => name.startsWith('@codingame/monaco-vscode-')
	|| ((name === 'monaco-editor' || name === 'vscode') && String(spec).startsWith('npm:@codingame/'));

export function assertPinsAgree(pin) {
	if (pin.client.vscode !== pin.server.vscode) {
		throw new Error(`VS Code version skew: client ${pin.client.vscode}, server ${pin.server.vscode}`);
	}
	if (!/^[0-9a-f]{40}$/.test(pin.server.commit)) throw new Error(`server commit is not a 40-hex commit: ${pin.server.commit}`);
}

// Every client package must be the exact pinned version, never a range: `^37.6.1` would let an
// install pick a release built on another VS Code commit (C1).
export function clientPinViolations(deps, pin) {
	const exact = pin.client.version;
	return Object.entries(deps)
		.filter(isClientPackage)
		.filter(([, spec]) => spec !== exact && !spec.endsWith(`@${exact}`))
		.map(([name, spec]) => `${name}@${spec}`);
}
