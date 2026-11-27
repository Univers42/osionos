/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   heartbeat.mjs                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The machine's presence (own-machines plan, devil 2026-10-31, 3, 6, 7): a signed beat tells the
// bridge where the app can reach it, and the reply hands over the bridge's next key. Pairing ends
// only on a gone a pinned bridge key signed for this machine and this beat (devil 2026-11-27, TB14):
// the identity is archived, then `onGone` forgets the remembered computers and roots and stops (TB15).
// Any other 410 changes nothing, so a lost row, a wrong bridge or a proxy cannot unpair a machine.
//
// Caveat: a connector of this version against a bridge older than the signed gone never unpairs on
// removal; it keeps beating into an unsigned 410 (logged hourly). New openings still fail, since the
// bridge mints nothing for a removed machine, but open sessions last until the node stops (TB17:
// the bridge ships first).
// Caveat: a gone is verified against the keys pinned now; a connector offline across a full key
// rotation pins neither key, so it ignores the gone and must be unpaired locally (TB17).
// Caveat: erasing the owner's account deletes the machine row, so the bridge answers unknown and the
// connector never unpairs itself; the guide's local unpair is the only cleanup (TB18).
import { createPrivateKey } from 'node:crypto';
import { chmodSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { fromB64url, signMessage, verifyMessage } from '../../scripts/ide-agent-frames.mjs';
import { goneMessage, heartbeatMessage, nextKeyMessage } from '../../scripts/ide-machine-protocol.mjs';
import { loadMachine, saveMachine } from './machine-identity.mjs';

const INTERVAL_MS = 30_000;
const REFUSED_LOG_MS = 3_600_000;

/**
 * The pinned set after one reply (devil 2026-10-31, 3): a next key joins only when a key already
 * pinned signed it, and a pinned key the bridge no longer lists leaves. A reply that lists none of
 * the pinned keys is not the bridge we paired with, so it changes nothing.
 */
function rotateKeys(keys, offered, origin) {
	const listed = (Array.isArray(offered) ? offered : []).filter((key) => key && typeof key.kid === 'string');
	const kept = Object.fromEntries(Object.entries(keys).filter(([kid]) => listed.some((key) => key.kid === kid)));
	if (Object.keys(kept).length === 0) return keys;
	for (const { kid, publicKey, sig } of listed) {
		if (Object.hasOwn(kept, kid) || typeof sig !== 'string' || typeof publicKey !== 'string') continue;
		const message = nextKeyMessage({ origin, kid, publicKey });
		if (Object.values(keys).some((pinned) => verifyMessage(fromB64url(pinned), message, sig))) kept[kid] = publicKey;
	}
	return kept;
}

const sameKeys = (left, right) => JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());

/** Replaces the contents of `keys` in place: the machine session verifies tokens against it. */
function replaceKeys(keys, next) {
	for (const kid of Object.keys(keys)) if (!Object.hasOwn(next, kid)) delete keys[kid];
	Object.assign(keys, next);
}

/** True only for the bridge's signed gone for this machine and the beat that carried `ts` (TB14). */
function isSignedGone(body, { keys, origin, machineId, ts }) {
	const gone = body !== null && typeof body === 'object' ? body.gone : null;
	if (gone === null || typeof gone !== 'object') return false;
	if (gone.machineId !== machineId || gone.ts !== ts || typeof gone.kid !== 'string' || !Object.hasOwn(keys, gone.kid)) return false;
	return typeof gone.sig === 'string' && verifyMessage(fromB64url(keys[gone.kid]), goneMessage({ origin, machineId, ts }), gone.sig);
}

/** Moves machine.json aside: revocation is one-way, so the archive is a record, never a restore path. */
function archiveIdentity(file, at) {
	const archived = join(dirname(file), `machine.removed-${new Date(at).toISOString().replace(/[:.]/g, '-')}.json`);
	renameSync(file, archived);
	chmodSync(archived, 0o600);
}

export function createHeartbeat({ file, keys, ideOrigin, fetchImpl = fetch, onGone, log = console.error, now = Date.now }) {
	const machine = loadMachine(file);
	const privateKey = createPrivateKey({ key: Buffer.from(machine.privateKey, 'base64url'), format: 'der', type: 'pkcs8' });
	let lastTs = 0;
	let lastRefusedLog = -Infinity;
	let timer = null;

	async function answerGone(res, ts) {
		const body = await res.json().catch(() => null);
		if (!isSignedGone(body, { keys, origin: machine.bridgeUrl, machineId: machine.machineId, ts })) {
			if (now() - lastRefusedLog >= REFUSED_LOG_MS) {
				lastRefusedLog = now();
				log('osionos-node: the bridge answered 410 without a signed removal; staying paired');
			}
			return 'refused';
		}
		clearInterval(timer);
		archiveIdentity(file, now());
		await onGone();
		return 'gone';
	}

	// Caveat: an unreachable bridge is reported, never treated as a revocation; a removed machine
	// keeps serving until the bridge answers again. New sessions are bounded by their tokens' 900 s
	// life, and a remembered computer by its 60 s resume assertion, which the bridge stops minting
	// once the machine is removed (R8); a web terminal shell already open is not (ADR 0041: the
	// token gates the opening, not the life): it lives until its socket closes, or until a signed
	// gone here stops the node (within one beat, 30 s).
	async function once() {
		const ts = Math.max(now(), lastTs + 1);
		lastTs = ts;
		const sig = signMessage(privateKey, heartbeatMessage({ origin: machine.bridgeUrl, machineId: machine.machineId, ideOrigin, ts }));
		let res;
		try {
			res = await fetchImpl(`${machine.bridgeUrl}/api/machines/heartbeat`, {
				method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ machineId: machine.machineId, ideOrigin, ts, sig }),
			});
		} catch {
			return 'unreachable';
		}
		if (res.status === 410) return answerGone(res, ts);
		if (!res.ok) return 'refused';
		const next = rotateKeys(keys, (await res.json().catch(() => ({}))).bridgeKeys, machine.bridgeUrl);
		if (!sameKeys(keys, next)) {
			saveMachine(file, { ...machine, bridgeKeys: next });
			replaceKeys(keys, next);
		}
		return 'ok';
	}

	return {
		once,
		start() { void once(); timer = setInterval(() => void once(), INTERVAL_MS); timer.unref?.(); },
		stop() { clearInterval(timer); },
	};
}
