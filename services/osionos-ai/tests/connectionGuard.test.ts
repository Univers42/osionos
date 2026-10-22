import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

/**
 * The envelope and the guard, on their own.
 *
 * The service reads its configuration when it is imported, so the KEK of the
 * envelope is in the environment before the first import.
 */
process.env.OSIONOS_AI_KEK = Buffer.alloc(32, 7).toString('base64');
process.env.OSIONOS_AI_KEK_ID = 'k1';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const { connectionAad, openSecret, sealSecret } = await import('../src/connections/crypto.ts');
const { checkEndpointUrl, guardedLookup, guardedShortFetch } = await import(
	'../src/connections/endpointGuard.ts'
);

/** The result of a lookup of the guard. */
function lookupWith(
	lookup: ReturnType<typeof guardedLookup>,
	hostname: string,
): Promise<{ address?: string; error?: Error }> {
	return new Promise((resolve) => {
		lookup(hostname, {}, (error, address) => {
			resolve({
				...(typeof address === 'string' && address.length > 0 ? { address } : {}),
				...(error ? { error } : {}),
			});
		});
	});
}

/** The messages of an error and of everything it was caused by. */
function causeMessages(error: unknown): string[] {
	const messages: string[] = [];
	let current: unknown = error;
	for (let depth = 0; current && depth < 10; depth += 1) {
		messages.push(current instanceof Error ? current.message : String(current));
		current = current instanceof Error ? current.cause : undefined;
	}
	return messages;
}

describe('osionos-ai envelope and guard', () => {
	it('a secret opens only with its own row, its own owner and its own key', () => {
		const id = randomUUID();
		const aad = connectionAad(id, USER_A);
		const sealed = sealSecret('the-secret-value', aad);
		const row = { secret_box: sealed.secretBox, wrapped_dek: sealed.wrappedDek, kek_id: sealed.kekId };
		assert.equal(openSecret(row, aad), 'the-secret-value');

		// A flipped byte of the box: the tag does not match.
		const flipped = Buffer.from(sealed.secretBox);
		flipped[flipped.length - 1] ^= 0xff;
		assert.throws(() => openSecret({ ...row, secret_box: flipped }, aad));
		// Another row, and another owner: the associated data does not match.
		assert.throws(() => openSecret(row, connectionAad(randomUUID(), USER_A)));
		assert.throws(() => openSecret(row, connectionAad(id, USER_B)));
		// Another KEK: the row names one this deployment does not have.
		assert.throws(() => openSecret({ ...row, kek_id: 'k9' }, aad));
	});

	it('the guard refuses the inside of a network', () => {
		const refused = [
			'http://x.example',
			'https://127.0.0.1',
			'https://10.1.2.3',
			'https://169.254.169.254',
			'https://[::1]',
			'https://[::ffff:127.0.0.1]',
			// The prefixes that carry an IPv4 address: ::/96, NAT64, 6to4
			// and the discard-only one.
			'https://[::7f00:1]',
			'https://[64:ff9b::a00:1]',
			'https://[2002:7f00:1::]',
			'https://[100::1]',
			'https://u:p@x.example',
			'ftp://x.example',
		];
		for (const url of refused) {
			assert.throws(() => checkEndpointUrl(url), `${url} must be refused`);
		}
		// A public host is fine, and the path is kept.
		assert.equal(checkEndpointUrl('https://api.example/v1').pathname, '/v1');
	});

	it('the agent of the guard refuses a private host when it connects', async () => {
		// A hostname, so a lookup happens: localhost is not a development
		// host, and it answers with the loopback. The port is 9999 and not 9:
		// undici's fetch refuses the bad ports of the Fetch spec (9 is one of
		// them) before it ever resolves the name, so the guard would never
		// be reached. Nothing listens on 9999, so without the guard the
		// connection is refused instead.
		let failure: unknown;
		try {
			await guardedShortFetch('https://localhost:9999/');
		} catch (error) {
			failure = error;
		}
		assert.ok(failure, 'the fetch must not succeed');
		const messages = causeMessages(failure);
		// The guard refused, and it refused before the connection was tried.
		assert.ok(
			messages.some((message) => message.includes('the address is not allowed')),
			`the guard must be the one that refuses: ${messages.join(' | ')}`,
		);
		assert.ok(
			!messages.some((message) => message.includes('ECONNREFUSED')),
			`the guard must refuse before the connection is tried: ${messages.join(' | ')}`,
		);
	});

	it('a host that answers with a private address is refused', async () => {
		const mixed = await lookupWith(
			guardedLookup(async () => [
				{ address: '93.184.216.34', family: 4 },
				{ address: '10.0.0.1', family: 4 },
			]),
			'mixed.example',
		);
		assert.ok(mixed.error, 'a host with a private address must be refused');
		assert.equal(mixed.address, undefined);

		const publicOnly = await lookupWith(
			guardedLookup(async () => [{ address: '93.184.216.34', family: 4 }]),
			'public.example',
		);
		assert.equal(publicOnly.error, undefined);
		assert.equal(publicOnly.address, '93.184.216.34');
	});
});
