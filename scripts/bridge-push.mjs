/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-push.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Web Push (`/api/push/*`) with ZERO dependencies — RFC 8291 (aes128gcm message
 * encryption) + RFC 8292 (VAPID) implemented on node:crypto. Subscriptions are
 * per-user (session.userId); `sendWebPush` is exported for the tasks/comments
 * planes to reuse. Push is dormant (send is a no-op) when the VAPID keypair is
 * unset, so the stack comes up without secrets.
 */

import crypto from 'node:crypto';
import { bearerToken, readJsonBody, rest, sendJson } from './bridge-social-core.mjs';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (str) => Buffer.from(String(str), 'base64url');

/**
 * Encrypt `plaintext` for a subscription's keys per RFC 8291. `asKeys`/`salt` are
 * injectable so the RFC 8291 §5 test vector can be reproduced deterministically.
 * Returns { body, salt, cek, nonce, asPublic } — body is the aes128gcm message.
 */
export function encryptPayload(plaintext, uaPublicB64, authB64, { asKeys, salt } = {}) {
	const uaPublic = fromB64u(uaPublicB64);        // 65-byte uncompressed P-256 point
	const authSecret = fromB64u(authB64);          // 16-byte auth secret
	const message = Buffer.from(plaintext, 'utf8');

	const ecdh = crypto.createECDH('prime256v1');
	if (asKeys?.private) ecdh.setPrivateKey(fromB64u(asKeys.private)); else ecdh.generateKeys();
	const asPublic = asKeys?.public ? fromB64u(asKeys.public) : ecdh.getPublicKey();
	const useSalt = salt ? fromB64u(salt) : crypto.randomBytes(16);
	const sharedSecret = ecdh.computeSecret(uaPublic);

	// Combine ECDH + auth secrets (RFC 8291 §3.4): IKM = HKDF(auth, ecdh, keyInfo, 32).
	const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
	const ikm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));

	// Content-encryption key + nonce (RFC 8188 aes128gcm).
	const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, useSalt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
	const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, useSalt, Buffer.from('Content-Encoding: nonce\0'), 12));

	// Single record: plaintext || 0x02 (last-record delimiter, no extra padding).
	const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
	const record = Buffer.concat([message, Buffer.from([0x02])]);
	const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

	// aes128gcm content-coding header: salt(16) || rs(4, BE) || idlen(1) || keyid(as_public).
	const rs = Buffer.alloc(4);
	rs.writeUInt32BE(4096, 0);
	const header = Buffer.concat([useSalt, rs, Buffer.from([asPublic.length]), asPublic]);
	return { body: Buffer.concat([header, ciphertext]), salt: useSalt, cek, nonce, asPublic };
}

/** A signed VAPID ES256 JWT for `endpoint` (RFC 8292). `now` is injectable for tests. */
export function buildVapidJwt(endpoint, vapid, now = Date.now()) {
	const url = new URL(endpoint);
	const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
	const claims = b64u(JSON.stringify({
		aud: `${url.protocol}//${url.host}`,
		exp: Math.floor(now / 1000) + 12 * 3600,
		sub: vapid.subject,
	}));
	const signingInput = `${header}.${claims}`;
	const pub = fromB64u(vapid.publicKey); // 0x04 || X(32) || Y(32)
	const key = crypto.createPrivateKey({
		key: { kty: 'EC', crv: 'P-256', d: vapid.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
		format: 'jwk',
	});
	const signature = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
	return `${signingInput}.${b64u(signature)}`;
}

/**
 * Push `payloadJson` (a string) to one subscription. Returns the push service
 * HTTP status (201 = queued; 404/410 = gone, caller should delete the row); 0
 * when VAPID is unconfigured (dormant). Never throws on a delivery failure.
 */
export async function sendWebPush(subscription, payloadJson, config, fetchImpl = fetch) {
	if (!config.vapid?.publicKey || !config.vapid?.privateKey) return 0;
	try {
		const { body } = encryptPayload(payloadJson, subscription.p256dh, subscription.auth);
		const response = await fetchImpl(subscription.endpoint, {
			method: 'POST',
			headers: {
				'Content-Encoding': 'aes128gcm',
				'Content-Type': 'application/octet-stream',
				TTL: '86400',
				Authorization: `vapid t=${buildVapidJwt(subscription.endpoint, config.vapid)}, k=${config.vapid.publicKey}`,
			},
			body,
		});
		return response.status;
	} catch {
		return 0;
	}
}

/** Fan out `payloadJson` to every subscription of `userId`; prune 404/410 rows. */
export async function pushToUser(config, fetchImpl, userId, payloadJson) {
	if (!config.vapid?.publicKey) return;
	const rows = await rest(config, fetchImpl, `osionos_push_subscriptions?user_id=eq.${userId}&select=*`);
	for (const sub of Array.isArray(rows) ? rows : []) {
		const status = await sendWebPush(sub, payloadJson, config, fetchImpl);
		if (status === 404 || status === 410) {
			await rest(config, fetchImpl, `osionos_push_subscriptions?id=eq.${sub.id}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
		}
	}
}

async function subscribe(deps, session, request, response, config) {
	const payload = await readJsonBody(request).catch(() => ({}));
	const endpoint = String(payload?.endpoint ?? '');
	const p256dh = String(payload?.keys?.p256dh ?? '');
	const auth = String(payload?.keys?.auth ?? '');
	if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) {
		return sendJson(response, 400, { ok: false, message: 'Invalid subscription.' }, config);
	}
	await rest(config, deps.fetchImpl, 'osionos_push_subscriptions', {
		method: 'POST',
		body: { user_id: session.userId, endpoint, p256dh, auth, last_seen_at: new Date().toISOString() },
		prefer: 'resolution=merge-duplicates,return=minimal',
	});
	return sendJson(response, 200, { ok: true }, config);
}

async function unsubscribe(deps, session, url, response, config) {
	const endpoint = String(url.searchParams.get('endpoint') ?? '');
	if (!endpoint) return sendJson(response, 400, { ok: false, message: 'Missing endpoint.' }, config);
	await rest(config, deps.fetchImpl,
		`osionos_push_subscriptions?user_id=eq.${session.userId}&endpoint=eq.${encodeURIComponent(endpoint)}`,
		{ method: 'DELETE', prefer: 'return=minimal' });
	return sendJson(response, 200, { ok: true }, config);
}

/** Build the /api/push dispatcher. deps: { config, verifySession, fetchImpl? }. */
export function createPushHandler({ config, verifySession, fetchImpl = fetch }) {
	const deps = { fetchImpl };
	return async function handlePushRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		if (!pathname.startsWith('/api/push')) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			// Public: the client needs the VAPID public key to subscribe (no session).
			if (pathname === '/api/push/vapid-public-key' && method === 'GET') {
				return sendJson(response, 200, { ok: true, publicKey: requestConfig.vapid?.publicKey || null }, requestConfig);
			}
			const session = verifySession(bearerToken(request), requestConfig);
			if (pathname === '/api/push/subscribe' && method === 'POST') return await subscribe(deps, session, request, response, requestConfig);
			if (pathname === '/api/push/subscribe' && method === 'DELETE') return await unsubscribe(deps, session, url, response, requestConfig);
			return sendJson(response, 404, { ok: false, message: 'Push route not found.' }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Push request failed.' }, requestConfig);
		}
	};
}
