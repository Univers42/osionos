/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-push.test.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildVapidJwt, encryptPayload } from '../../scripts/bridge-push.mjs';

// RFC 8291 §5 known-answer test vector.
const VECTOR = {
	plaintext: 'When I grow up, I want to be a watermelon',
	uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
	auth: 'BTBZMqHH6r4Tts7J_aSIgg',
	asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
	asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
	salt: 'DGv6ra1nlYgDCS1FRnbzlw',
	cek: 'oIhVW04MRdy2XN9CiKLxTg',
	nonce: '4h_95klXJ5E_qnoN',
	ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

const b64u = (buf) => Buffer.from(buf).toString('base64url');
// aes128gcm header = salt(16) + rs(4) + idlen(1) + keyid(as_public = 65) = 86 bytes.
const HEADER_LEN = 16 + 4 + 1 + 65;

describe('encryptPayload — RFC 8291 §5 known-answer vector', () => {
	const out = encryptPayload(VECTOR.plaintext, VECTOR.uaPublic, VECTOR.auth, {
		asKeys: { private: VECTOR.asPrivate, public: VECTOR.asPublic },
		salt: VECTOR.salt,
	});

	it('derives the CEK from the vector (validates the HKDF key schedule)', () => {
		assert.equal(b64u(out.cek), VECTOR.cek);
	});

	it('derives the nonce from the vector', () => {
		assert.equal(b64u(out.nonce), VECTOR.nonce);
	});

	it('produces the vector ciphertext (validates AES-128-GCM + padding + framing)', () => {
		assert.equal(b64u(out.body.subarray(HEADER_LEN)), VECTOR.ciphertext);
	});

	it('frames the header with the sender public key as keyid', () => {
		assert.equal(out.body[16 + 4], 65, 'idlen byte');
		assert.equal(b64u(out.body.subarray(HEADER_LEN - 65, HEADER_LEN)), VECTOR.asPublic);
	});
});

describe('buildVapidJwt — RFC 8292', () => {
	// A throwaway P-256 keypair in the raw (base64url) shape the bridge stores.
	const ecdh = crypto.createECDH('prime256v1');
	ecdh.generateKeys();
	const vapid = {
		publicKey: b64u(ecdh.getPublicKey()),
		privateKey: b64u(ecdh.getPrivateKey()),
		subject: 'mailto:admin@osionos.local',
	};
	const jwt = buildVapidJwt('https://push.example.com/send/abc123', vapid, 1_768_000_000_000);
	const [header, claims, signature] = jwt.split('.');

	it('carries an ES256 header and audience/exp/sub claims', () => {
		assert.equal(JSON.parse(Buffer.from(header, 'base64url').toString()).alg, 'ES256');
		const payload = JSON.parse(Buffer.from(claims, 'base64url').toString());
		assert.equal(payload.aud, 'https://push.example.com');
		assert.equal(payload.sub, 'mailto:admin@osionos.local');
		assert.ok(payload.exp > 1_768_000_000, 'exp is in the future');
	});

	it('is verifiable with the VAPID public key (P-1363 signature)', () => {
		const pub = Buffer.from(vapid.publicKey, 'base64url');
		const key = crypto.createPublicKey({
			key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
			format: 'jwk',
		});
		const ok = crypto.verify('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
		assert.ok(ok, 'signature verifies');
	});
});
