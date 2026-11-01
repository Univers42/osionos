/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machine-identity.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A paired machine (own-machines plan): its identity file, and the session rules the IDE origin
// runs with once paired. It trusts only tokens the bridge signed for it (devil 2026-10-31, 2), so
// it holds no secret that could mint one; its cookie cap is keyed by a secret that never leaves
// this process.
import { createPrivateKey, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { isNodeId } from '../../scripts/ide-token.mjs';
import { signMessage } from '../../scripts/ide-agent-frames.mjs';
import { verifyMachineToken, whoamiMessage } from '../../scripts/ide-machine-protocol.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
const fail = (status) => Object.assign(new Error(String(status)), { status });

function isMachine(value) {
	return value !== null && typeof value === 'object' && isNodeId(value.machineId) && UUID.test(value.ownerId ?? '')
		&& typeof value.bridgeUrl === 'string' && typeof value.privateKey === 'string'
		&& value.bridgeKeys !== null && typeof value.bridgeKeys === 'object' && Object.keys(value.bridgeKeys).length > 0;
}

// The key in this file opens the owner's files and terminal to whoever holds it, and whoever can
// write its folder can swap the file for one naming their own account. Windows has no uid: skipped.
function assertPrivate(path, forbiddenBits, problem) {
	const stat = statSync(path);
	const uid = process.getuid?.();
	if (uid !== undefined && stat.uid !== uid) throw new Error(`${path} belongs to another user; refusing it`);
	if (stat.mode & forbiddenBits) throw new Error(`${path} is ${problem}`);
}
const assertPrivateFolder = (folder) => assertPrivate(folder, 0o022, 'writable by others; chmod 700 it');
const assertPrivateFile = (file) => assertPrivate(file, 0o077, 'readable or writable by others; chmod 600 it or pair again');

export function loadMachine(file) {
	if (!existsSync(file)) return null;
	assertPrivateFolder(dirname(file));
	assertPrivateFile(file);
	const value = JSON.parse(readFileSync(file, 'utf8'));
	if (!isMachine(value)) throw new Error(`${file} is not a machine identity; pair again (osionos-node pair)`);
	return value;
}

/**
 * Written to a fresh 0600 temp file (`wx`: never through a name someone planted) and renamed, so
 * no reader ever sees it partial or world-readable.
 */
export function saveMachine(file, machine) {
	if (!isMachine(machine)) throw new Error('refusing to save an incomplete machine identity');
	const folder = dirname(file);
	mkdirSync(folder, { recursive: true, mode: 0o700 });
	// An existing ~/.osionos of ours made by an older install (0775) is tightened, never trusted as is.
	if (statSync(folder).uid === process.getuid?.()) chmodSync(folder, 0o700);
	assertPrivateFolder(folder);
	const temp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
	writeFileSync(temp, `${JSON.stringify(machine, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
	renameSync(temp, file);
}

const privateKeyOf = (machine) => createPrivateKey({ key: Buffer.from(machine.privateKey, 'base64url'), format: 'der', type: 'pkcs8' });

// Caveat: the used-jti set lives in memory, so a restart forgets it; a token is still bounded by its
// own 900 s expiry, which is the replay window after a restart.
function createJtiGuard() {
	const seen = new Map();
	return (jti, exp) => {
		const now = Math.floor(Date.now() / 1000);
		for (const [id, until] of seen) if (until <= now) seen.delete(id);
		if (seen.has(jti)) return false;
		seen.set(jti, exp);
		return true;
	};
}

function readNonce(req) {
	return new Promise((resolve) => {
		let body = '';
		req.on('data', (chunk) => { body += chunk; if (body.length > 512) req.destroy(); });
		req.on('end', () => {
			try { const { nonce } = JSON.parse(body); resolve(NONCE.test(nonce ?? '') ? nonce : null); } catch { resolve(null); }
		});
		req.on('error', () => resolve(null));
	});
}

function json(res, status, body) {
	res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
	res.end(JSON.stringify(body));
}

/** What createIdeOriginServer needs to run as this paired machine. */
export function createMachineSession({ machine, home }) {
	const keys = { ...machine.bridgeKeys };
	const firstUse = createJtiGuard();
	const privateKey = privateKeyOf(machine);

	function verifySession(bearer, { ideOrigin }) {
		let claims;
		try { claims = verifyMachineToken(bearer, { keys, machine: machine.machineId, aud: ideOrigin }); } catch { throw fail(401); }
		if (!firstUse(claims.jti, claims.exp)) throw fail(401);
		return { userId: claims.sub, exp: claims.exp, iat: claims.iat };
	}

	// `/api/machine/whoami` lets the app check that this port is the machine it was told about
	// (devil 2026-10-31, 5); `/api/machine/home` names the folder a window opens on;
	// `/api/machine/self` names this machine to its own page, which opens without an id and
	// relays it to the app only by postMessage. A plain GET carries no Origin, so its gate is the
	// fetch metadata alone, and nothing here answers CORS: another site cannot read it.
	async function machineRoutes(req, res, { ideOrigin, isSameOrigin, isSameOriginRead, hasSession }) {
		if (req.url === '/api/machine/self' && req.method === 'GET') {
			if (!isSameOriginRead(req)) return json(res, 403, { error: 'forbidden' });
			return json(res, 200, { paired: true, machineId: machine.machineId });
		}
		if (req.url === '/api/machine/whoami' && req.method === 'POST') {
			if (!isSameOrigin(req)) return json(res, 403, { error: 'forbidden' });
			const nonce = await readNonce(req);
			if (!nonce) return json(res, 400, { error: 'bad_request' });
			const message = whoamiMessage({ origin: machine.bridgeUrl, machineId: machine.machineId, ideOrigin, nonce });
			return json(res, 200, { machineId: machine.machineId, sig: signMessage(privateKey, message) });
		}
		if (req.url === '/api/machine/home' && req.method === 'GET') {
			if (!hasSession(req)) return json(res, 401, { error: 'unauthorized' });
			return json(res, 200, { folder: home });
		}
		return json(res, 404, { error: 'not_found' });
	}

	return {
		keys,
		originOptions: { capSecret: randomBytes(32).toString('base64url'), ownerId: machine.ownerId, verifySession, machineRoutes },
	};
}
