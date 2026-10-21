import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config.ts';

/**
 * The envelope of a user's secret.
 *
 * A secret never sits in the database in the clear. It is sealed under a data
 * key of its own — a fresh 32 bytes per secret — and that data key is sealed
 * under the KEK of the deployment. The database holds two boxes and the name
 * of the KEK; the plaintext is nowhere.
 *
 * BOX FORMAT (both layers): version(1) | iv(12) | tag(16) | ciphertext.
 * The version is one byte and says which layout the box has; the iv is the
 * random 12 bytes of the AES-256-GCM nonce; the tag is the 16 bytes of the
 * GCM authentication tag; the rest is the ciphertext. Both layers use the
 * same layout, and both are sealed with the same associated data.
 */

/** The version byte of the box layout this module writes and reads. */
const BOX_VERSION = 1;
/** The size of the GCM nonce. */
const IV_BYTES = 12;
/** The size of the GCM authentication tag. */
const TAG_BYTES = 16;
/** The size of the data key: AES-256. */
const DEK_BYTES = 32;
/** The size of the KEK: AES-256. */
const KEK_BYTES = 32;

/** A sealed secret: the two boxes and the name of the KEK that wrapped the key. */
export interface SealedSecret {
	/** The secret, under the data key. */
	secretBox: Buffer;
	/** The data key, under the KEK. */
	wrappedDek: Buffer;
	/** The name of the KEK: the row carries it, so a rotation stays possible. */
	kekId: string;
}

/** The row a secret is opened from: the two boxes and the name of the KEK. */
export interface SecretRow {
	secret_box: Buffer | null;
	wrapped_dek: Buffer | null;
	kek_id: string | null;
}

/** A failure of the envelope: the tag did not match, or the KEK is unknown. */
export class SecretError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'secret_error';
	}
}

/**
 * The associated data of a box: the connection and its owner.
 *
 * Both layers are sealed with it, so a box copied onto another row, or onto
 * another user's row, fails to open: the tag never matches.
 */
export function connectionAad(connectionId: string, ownerUserId: string): string {
	return `${connectionId}:${ownerUserId}`;
}

/** The KEK of the deployment, or null when it is not set. */
function kekMaterial(): Buffer | null {
	const raw = config.kek;
	if (!raw) return null;
	let key: Buffer;
	try {
		key = Buffer.from(raw, 'base64');
	} catch {
		return null;
	}
	return key.length === KEK_BYTES ? key : null;
}

/**
 * Whether the service can seal a secret at all.
 *
 * Without a KEK the users' own connections are off: the creation of a
 * connection answers 503 connections_unavailable, and the platform connection
 * is still served.
 */
export function kekAvailable(): boolean {
	return kekMaterial() !== null;
}

/** One box: the version, the iv, the tag and the ciphertext of one layer. */
function sealBox(iv: Buffer, key: Buffer, plaintext: Buffer, aad: string): Buffer {
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from(aad, 'utf8'));
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	return Buffer.concat([Buffer.from([BOX_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
}

/** One box, opened: the tag must match, or the open fails. */
function openBox(box: Buffer, key: Buffer, aad: string): Buffer {
	if (box.length < 1 + IV_BYTES + TAG_BYTES) throw new SecretError('the box is too short');
	if (box[0] !== BOX_VERSION) throw new SecretError('unknown box version');
	const iv = box.subarray(1, 1 + IV_BYTES);
	const tag = box.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
	const ciphertext = box.subarray(1 + IV_BYTES + TAG_BYTES);
	try {
		const decipher = createDecipheriv('aes-256-gcm', key, iv);
		decipher.setAAD(Buffer.from(aad, 'utf8'));
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	} catch {
		// A wrong key, a wrong associated data and a flipped byte all land here.
		throw new SecretError('the box does not open');
	}
}

/**
 * Seals a secret under a fresh data key, and the data key under the KEK.
 *
 * The associated data binds the box to one row: pass the id and the owner of
 * the connection, and the row id must already exist — the service generates
 * the uuid and inserts it with the sealed secret.
 */
export function sealSecret(plaintext: string, aad: string): SealedSecret {
	const key = kekMaterial();
	if (!key) throw new SecretError('no KEK is configured');
	const dek = randomBytes(DEK_BYTES);
	const secretBox = sealBox(randomBytes(IV_BYTES), dek, Buffer.from(plaintext, 'utf8'), aad);
	const wrappedDek = sealBox(randomBytes(IV_BYTES), key, dek, aad);
	return { secretBox, wrappedDek, kekId: config.kekId };
}

/**
 * Opens a secret: the data key first, then the secret under it.
 *
 * It throws when the tag does not match (a flipped byte, another row's
 * associated data) and when the row names a KEK this deployment does not
 * have.
 */
export function openSecret(row: SecretRow, aad: string): string {
	const key = kekMaterial();
	if (!key) throw new SecretError('no KEK is configured');
	if (row.kek_id !== config.kekId) throw new SecretError('unknown kek id');
	if (!row.secret_box || !row.wrapped_dek) throw new SecretError('the row carries no secret');
	const dek = openBox(row.wrapped_dek, key, aad);
	if (dek.length !== DEK_BYTES) throw new SecretError('the data key has a wrong size');
	return openBox(row.secret_box, dek, aad).toString('utf8');
}
