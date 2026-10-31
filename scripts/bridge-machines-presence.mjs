/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-machines-presence.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What the machine routes read from the environment (the bridge signing keys and the public
// origin every signed message carries) and what they keep in kv (presence, the last heartbeat
// ts). No path or file name ever reaches this file: presence is an origin and two times.
import { accountError } from './bridge-account-sudo.mjs';
import { signMessage } from './ide-agent-frames.mjs';
import { bridgeKeyFromSeed, nextKeyMessage } from './machine-protocol.mjs';

// A machine's window, not a person's (bridge-presence.mjs owns that one): the contract's 90 s,
// three of the node's 30 s beats.
// Caveat: a machine that died 89 s ago is listed online, and one behind a slow link that misses
// three beats is listed offline while it still serves.
const HEARTBEAT_INTERVAL_MS = 30_000;
const MACHINE_ONLINE_TTL_MS = 3 * HEARTBEAT_INTERVAL_MS;
const SKEW_MS = 60_000;
// Caveat: the last ts is kept 180 s (twice the skew window plus margin), past which a captured
// heartbeat is refused by the skew check anyway. The read-then-write of the last ts is not
// atomic, so two beats racing with different ts may both pass; the setNx on the exact ts is
// what stops a byte-for-byte replay racing the original.
const LAST_TS_TTL_MS = 180_000;
const UNAVAILABLE = 'Own machines are not configured on this bridge.';

const unavailable = () => accountError(503, 'machines_unavailable', UNAVAILABLE);

/** The bridge origin the nodes sign against; an explicit origin wins over the public URL. */
function publicOrigin(config, env) {
	const candidates = [config?.publicOrigin, env?.OSIONOS_BRIDGE_PUBLIC_ORIGIN, env?.OSIONOS_BRIDGE_PUBLIC_URL];
	const text = candidates.map((value) => String(value ?? '').trim()).find((value) => value !== '');
	try {
		return text ? new URL(text).origin : null;
	} catch {
		return null;
	}
}

function keyFrom(seed) {
	try {
		return bridgeKeyFromSeed(seed);
	} catch {
		throw unavailable();
	}
}

/** The current key, the optional next one, and the origin, or 503: there is no partial boot. */
export function machineSetup(config, env) {
	const origin = publicOrigin(config, env);
	const seed = String(env?.OSIONOS_MACHINE_SIGNING_KEY ?? '').trim();
	const nextSeed = String(env?.OSIONOS_MACHINE_SIGNING_KEY_NEXT ?? '').trim();
	if (!origin || !seed) throw unavailable();
	return { origin, seed, current: keyFrom(seed), next: nextSeed ? keyFrom(nextSeed) : null };
}

/** The keys a machine pins: the current one, and the next one signed by the current one. */
export function bridgeKeysOf({ origin, current, next }) {
	const keys = [{ kid: current.kid, publicKey: current.publicKey }];
	if (next) {
		const sig = signMessage(current.privateKey, nextKeyMessage({ origin, kid: next.kid, publicKey: next.publicKey }));
		keys.push({ kid: next.kid, publicKey: next.publicKey, sig });
	}
	return keys;
}

const presenceKey = (id) => `machine-presence:${id}`;

export async function readPresence(kv, id) {
	const text = await kv.get(presenceKey(id));
	if (typeof text !== 'string') return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export const writePresence = (kv, id, { ideOrigin, ts, now }) =>
	kv.set(presenceKey(id), JSON.stringify({ ideOrigin, ts, lastSeenAt: new Date(now).toISOString() }), MACHINE_ONLINE_TTL_MS);

export const dropPresence = (kv, id) => kv.getDel(presenceKey(id));

/** Within ±60 s of the bridge clock and strictly after the last accepted beat (condition 6). */
export async function acceptHeartbeatTs(kv, id, ts, now) {
	const stale = () => accountError(400, 'stale', 'The heartbeat ts is stale or replayed.');
	if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > SKEW_MS) throw stale();
	const last = Number(await kv.get(`machine-heartbeat-last:${id}`));
	if (Number.isFinite(last) && ts <= last) throw stale();
	if (!(await kv.setNx(`machine-heartbeat-seen:${id}:${ts}`, '1', LAST_TS_TTL_MS))) throw stale();
	await kv.set(`machine-heartbeat-last:${id}`, String(ts), LAST_TS_TTL_MS);
}
