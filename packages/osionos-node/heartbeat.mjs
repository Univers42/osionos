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
import { loadMachine } from './machine-identity.mjs';

const INTERVAL_MS = 30_000;

/** Pins a next key only when a key already pinned signed it. Mutates `keys`. */
function pinNextKeys(keys, offered, origin) {
	for (const { kid, publicKey, sig } of Array.isArray(offered) ? offered : []) {
		if (Object.hasOwn(keys, kid) || typeof sig !== 'string') continue;
		const message = nextKeyMessage({ origin, kid, publicKey });
		if (Object.values(keys).some((pinned) => verifyMessage(fromB64url(pinned), message, sig))) keys[kid] = publicKey;
	}
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
		pinNextKeys(keys, (await res.json().catch(() => ({}))).bridgeKeys, machine.bridgeUrl);
		return 'ok';
	}

	return {
		once,
		start() { void once(); timer = setInterval(() => void once(), INTERVAL_MS); timer.unref?.(); },
		stop() { clearInterval(timer); },
	};
}
