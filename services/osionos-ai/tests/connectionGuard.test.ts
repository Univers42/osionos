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
const { checkEndpointUrl, guardedLookup } = await import('../src/connections/endpointGuard.ts');

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
			'https://u:p@x.example',
			'ftp://x.example',
		];
		for (const url of refused) {
			assert.throws(() => checkEndpointUrl(url), `${url} must be refused`);
		}
		// A public host is fine, and the path is kept.
		assert.equal(checkEndpointUrl('https://api.example/v1').pathname, '/v1');
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
