/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   heartbeat.mjs                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The machine's presence (own-machines plan, devil 2026-10-31, 3, 6, 7): a signed beat tells the
// bridge where the app can reach it, the reply hands over the bridge's next key, and a 410 means
// the owner removed this machine, so it forgets its identity and stops.
import { createPrivateKey } from 'node:crypto';
import { rmSync } from 'node:fs';

import { fromB64url, signMessage, verifyMessage } from '../../scripts/ide-agent-frames.mjs';
import { heartbeatMessage, nextKeyMessage } from '../../scripts/machine-protocol.mjs';
import { loadMachine, saveMachine } from './machine-identity.mjs';

const INTERVAL_MS = 30_000;

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

export function createHeartbeat({ file, keys, ideOrigin, fetchImpl = fetch, onGone }) {
	const machine = loadMachine(file);
	const privateKey = createPrivateKey({ key: Buffer.from(machine.privateKey, 'base64url'), format: 'der', type: 'pkcs8' });
	let lastTs = 0;
	let timer = null;

	// Caveat: an unreachable bridge is reported, never treated as a revocation; a removed machine
	// keeps serving until the bridge answers again, bounded by its tokens' 900 s life.
	async function once() {
		const ts = Math.max(Date.now(), lastTs + 1);
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
		if (res.status === 410) {
			rmSync(file, { force: true });
			onGone();
			return 'gone';
		}
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
