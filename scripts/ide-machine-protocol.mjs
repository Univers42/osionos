/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machine-protocol.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The own-machines contract (docs/ide/vscode-backend/own-machines-plan.md, devil verdict
// 2026-10-31), shared by the bridge and osionos-node so both read one definition.
//
// A machine token is signed by the bridge's Ed25519 key and only verified by a machine, so a
// machine can never mint one, for anyone (condition 2). Every string a machine signs is
// domain-tagged and carries the bridge origin, so a signature is useless anywhere else (6).
// A resume assertion (devil verdict 2026-11-01, Amendment 1, R2) is the bridge's second kind: 60 s,
// no step-up, and it opens a shell only beside a remembered computer's device secret (R1).
import { createHash, createPrivateKey, randomBytes, randomUUID, sign } from 'node:crypto';

import { b64url, base32, fromB64url, rawPublicKey, signed, verifyMessage } from './ide-agent-frames.mjs';

export const MACHINE_TOKEN_VERSION = 'osionos_mc1';
export const RESUME_VERSION = 'osionos_mr1';
// Caveat: both lives are read on the verifying node's clock against the bridge's iat; a node clock
// more than a life away from the bridge's refuses every assertion of that kind (fails closed: the
// token path, then a step-up), and a 60 s resume is the first to go.
const MAX_TTL_SECONDS = 900;
const MAX_RESUME_TTL_SECONDS = 60;
const PKCS8_ED25519_SEED = Buffer.from('302e020100300506032b657004220420', 'hex');
const LOOPBACK_HOST = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const SUB_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const refuse = (why) => Object.assign(new Error(`machine token refused: ${why}`), { code: 'machine_token_invalid' });

/** A fresh machine id: 80 random bits, a valid node id that no two users can share (condition 8). */
export const newMachineId = () => `m-${base32(randomBytes(10)).toLowerCase()}`;

/** The bridge's signing key from its 32-byte seed; the boot fails on anything else (condition 3). */
export function bridgeKeyFromSeed(seed) {
	const raw = typeof seed === 'string' ? fromB64url(seed) : Buffer.alloc(0);
	if (raw.length !== 32 || b64url(raw) !== seed) throw new Error('OSIONOS_MACHINE_SIGNING_KEY must be a 32-byte base64url seed');
	const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_SEED, raw]), format: 'der', type: 'pkcs8' });
	const publicRaw = rawPublicKey(privateKey);
	const kid = base32(createHash('sha256').update(publicRaw).digest().subarray(0, 5)).toLowerCase();
	return { kid, publicKey: b64url(publicRaw), privateKey };
}

// Two kinds share one shape, `<version>.<kid>.<payload>.<sig>`, and nothing else: each signs under its
// own domain tag, so a signature of one never verifies as the other, on this node or an older one (A8).
const KINDS = Object.freeze({
	machine: { version: MACHINE_TOKEN_VERSION, domain: 'osionos-machine-token-v1', maxTtl: MAX_TTL_SECONDS, name: 'machine token' },
	resume: { version: RESUME_VERSION, domain: 'osionos-machine-resume-v1', maxTtl: MAX_RESUME_TTL_SECONDS, name: 'resume assertion' },
});

function signAssertion(kind, claims, { seed, now, ttlSeconds, jti }) {
	const { version, domain, maxTtl, name } = KINDS[kind];
	if (ttlSeconds > maxTtl) throw new Error(`a ${name} lives at most ${maxTtl} seconds`);
	const { kid, privateKey } = bridgeKeyFromSeed(seed);
	const iat = Math.floor(now / 1000);
	const exp = iat + ttlSeconds;
	const payload = b64url(Buffer.from(JSON.stringify({ ...claims, iat, exp, jti })));
	const signature = b64url(sign(null, signed(domain, kid, payload), privateKey));
	return { signed: `${version}.${kid}.${payload}.${signature}`, exp };
}

function verifyAssertion(kind, value, { keys, machine, aud, now }) {
	const { version, domain, maxTtl } = KINDS[kind];
	if (typeof value !== 'string') throw refuse('not a token');
	const parts = value.split('.');
	if (parts.length !== 4 || parts[0] !== version) throw refuse('wrong shape');
	const [, kid, payload, signature] = parts;
	const publicKey = Object.hasOwn(keys, kid) ? keys[kid] : null;
	if (!publicKey || !verifyMessage(fromB64url(publicKey), signed(domain, kid, payload), signature)) throw refuse('bad signature');
	let claims;
	try { claims = JSON.parse(fromB64url(payload).toString('utf8')); } catch { throw refuse('unreadable claims'); }
	if (!claims || typeof claims !== 'object' || !SUB_SHAPE.test(claims.sub ?? '')) throw refuse('no subject');
	if (claims.machine !== machine) throw refuse('another machine');
	if (claims.aud !== aud) throw refuse('another origin');
	const nowSeconds = Math.floor(now / 1000);
	if (!Number.isInteger(claims.exp) || claims.exp <= nowSeconds || claims.exp - claims.iat > maxTtl) throw refuse('expired');
	if (typeof claims.jti !== 'string' || claims.jti.length === 0) throw refuse('no jti');
	return claims;
}

/** `remember` is the person's "Remember this computer" choice (R6): signed only when true, so a
 *  token without it is byte-for-byte what an older bridge minted, and older nodes ignore it. */
export function signMachineToken({ sub, machine, aud, seed, now = Date.now(), ttlSeconds = MAX_TTL_SECONDS, jti = randomUUID(), remember = false }) {
	const claims = remember === true ? { sub, machine, aud, remember: true } : { sub, machine, aud };
	const { signed: token, exp } = signAssertion('machine', claims, { seed, now, ttlSeconds, jti });
	return { token, exp };
}

/** `keys` maps kid -> base64url raw public key (the set the machine pinned). Throws on any refusal. */
export function verifyMachineToken(token, { keys, machine, aud, now = Date.now() }) {
	return verifyAssertion('machine', token, { keys, machine, aud, now });
}

/** The second factor of a remembered computer (R1, R2): minted with no step-up, after the identity check. */
export function signResumeAssertion({ sub, machine, aud, seed, now = Date.now(), ttlSeconds = MAX_RESUME_TTL_SECONDS, jti = randomUUID() }) {
	const { signed: assertion, exp } = signAssertion('resume', { typ: 'resume', sub, machine, aud }, { seed, now, ttlSeconds, jti });
	return { assertion, exp };
}

export function verifyResumeAssertion(assertion, { keys, machine, aud, now = Date.now() }) {
	const claims = verifyAssertion('resume', assertion, { keys, machine, aud, now });
	if (claims.typ !== 'resume') throw refuse('not a resume assertion');
	return claims;
}

/** http on a 127.0.0.0/8 literal, port 1024-65535, nothing else (condition 6). */
export function isLoopbackIdeOrigin(value) {
	if (typeof value !== 'string') return false;
	let url;
	try { url = new URL(value); } catch { return false; }
	const octets = LOOPBACK_HOST.exec(url.hostname);
	const port = Number(url.port);
	return url.protocol === 'http:' && octets !== null && octets.slice(1).every((part) => Number(part) <= 255)
		&& Number.isInteger(port) && port >= 1024 && port <= 65535 && url.origin === value;
}

// What a machine signs with its own key. Each carries the bridge origin (condition 6).
export const pairStartMessage = ({ origin, pubkey, name, ts }) => signed('osionos-machine-pair-v1', origin, pubkey, name, String(ts));
export const pairPollMessage = ({ origin, pairId, ts }) => signed('osionos-machine-poll-v1', origin, pairId, String(ts));
export const heartbeatMessage = ({ origin, machineId, ideOrigin, ts }) => signed('osionos-machine-heartbeat-v1', origin, machineId, ideOrigin, String(ts));
export const whoamiMessage = ({ origin, machineId, ideOrigin, nonce }) => signed('osionos-machine-whoami-v1', origin, machineId, ideOrigin, nonce);
// What the bridge signs with its current key to hand a machine the next one (condition 3).
export const nextKeyMessage = ({ origin, kid, publicKey }) => signed('osionos-machine-next-key-v1', origin, kid, publicKey);
