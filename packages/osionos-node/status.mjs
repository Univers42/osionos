/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   status.mjs                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `osionos-node status` (devil 2026-11-27, D6, TB22-TB24): what a person needs to see whether this
// computer is paired, running and remembering, safe to paste in a support thread. It only reads: no
// store is opened (opening one rewrites its file), nothing is signed, no file text is echoed, and
// the email is masked by the bridge's own rule.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { maskAddress } from '../../scripts/bridge-mask-address.mjs';
import { loadMachine } from './machine-identity.mjs';
import { readRememberedSummary } from './remembered-computers.mjs';

const IDE_ORIGIN = 'http://127.0.0.1:4100';
const ORIGIN_FLAGS = new Set(['--app-origin', '--remember-origin']);

const isOrigin = (value) => {
	try { return new URL(value).origin === value; } catch { return false; }
};

/**
 * The origin flags of start.sh, and nothing else from it. Each argument there is single-quoted by
 * install.sh; a value that is not a bare origin is counted, never printed.
 * Caveat: reads only the quoting install.sh writes; a hand-edited start.sh with other quoting
 * shows no origins (under-reports), never its text.
 */
function readStartOrigins(file) {
	const found = { '--app-origin': [], '--remember-origin': [], unreadable: 0 };
	let text = '';
	try { text = readFileSync(file, 'utf8'); } catch { return null; }
	const args = [...text.matchAll(/'([^']*)'/g)].map((match) => match[1]);
	for (let index = 0; index < args.length; index += 1) {
		if (!ORIGIN_FLAGS.has(args[index])) continue;
		const value = args[index + 1];
		if (isOrigin(value)) found[args[index]].push(value);
		else found.unreadable += 1;
		index += 1;
	}
	return found;
}

function readIdentity(file) {
	try {
		const machine = loadMachine(file);
		return machine ? { machine } : { missing: true };
	} catch {
		return { unreadable: true };
	}
}

const ago = (ms) => {
	if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min`;
	if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h`;
	return `${Math.floor(ms / 86_400_000)} d`;
};

/** Which machine answers on the node's port: this one, another program, or nothing. */
async function probeService(machineId, fetchImpl) {
	try {
		const res = await fetchImpl(`${IDE_ORIGIN}/api/machine/self`, { headers: { 'sec-fetch-site': 'same-origin' }, signal: AbortSignal.timeout(2000) });
		const body = await res.json().catch(() => null);
		if (res.ok && body?.machineId === machineId) return `running on ${IDE_ORIGIN}`;
		return `not this machine: another program answers on ${IDE_ORIGIN}`;
	} catch {
		return 'not running';
	}
}

export async function readStatus({ home, fetchImpl = fetch, at = Date.now() }) {
	const dir = join(home, '.osionos');
	const identity = readIdentity(join(dir, 'machine.json'));
	const lines = [];
	if (identity.unreadable) lines.push('paired       machine.json is unreadable');
	else if (identity.missing) lines.push('paired       no: run the install line from the app');
	else {
		const { machine } = identity;
		const account = typeof machine.accountEmail === 'string' ? `, account ${maskAddress(machine.accountEmail)}` : '';
		lines.push(`paired       yes, machine ${machine.machineId}${account}, bridge ${machine.bridgeUrl}`);
		lines.push(`service      ${await probeService(machine.machineId, fetchImpl)}`);
	}
	const origins = readStartOrigins(join(dir, 'start.sh'));
	if (origins === null) lines.push('start line   none (start.sh is missing)');
	else {
		lines.push(`app origins  ${origins['--app-origin'].join(', ') || 'none'}`);
		lines.push(`remembers    ${origins['--remember-origin'].join(', ') || 'none'}`);
		if (origins.unreadable > 0) lines.push(`             ${origins.unreadable} origin value(s) in start.sh are not origins`);
	}
	const remembered = readRememberedSummary(join(dir, 'remembered-computers.json'), at);
	lines.push(`remembered   ${remembered.length} computer(s)${remembered.map((one) => `\n             ${isOrigin(one.appOrigin) ? one.appOrigin : '(not an origin)'}: used ${ago(one.idleMs)} ago, ${ago(one.ageMs)} old`).join('')}`);
	const archived = existsSync(dir) ? readdirSync(dir).filter((name) => /^machine\.removed-.*\.json$/.test(name)).length : 0;
	if (archived > 0) lines.push(`removed      ${archived} archived identity file(s): a record, not a way back`);
	return lines.join('\n');
}
