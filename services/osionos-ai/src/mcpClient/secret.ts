import { openSecret, sealSecret } from '../connections/crypto.ts';
import type { SealedSecret } from '../connections/crypto.ts';

/**
 * The header a user gives a server, sealed with the envelope of the
 * connections (C274).
 *
 * The associated data names the server AND its owner, so a box copied onto
 * another row, or onto another user's row, fails to open. It starts with
 * `mcp:` so it can never equal the AAD of a connection (`id:owner`).
 */
export function mcpAad(serverId: string, ownerId: string): string {
	return `mcp:${serverId}:${ownerId}`;
}

export function sealHeader(serverId: string, ownerId: string, value: string): SealedSecret {
	return sealSecret(value, mcpAad(serverId, ownerId));
}

export interface HeaderBox {
	id: string;
	owner_id: string;
	header_ciphertext: Buffer | null;
	header_wrapped_dek: Buffer | null;
	header_kek_id: string | null;
}

/** The plaintext of the header, or '' when the server has none. */
export function openHeader(row: HeaderBox): string {
	if (!row.header_ciphertext) return '';
	return openSecret(
		{ secret_box: row.header_ciphertext, wrapped_dek: row.header_wrapped_dek, kek_id: row.header_kek_id },
		mcpAad(row.id, row.owner_id),
	);
}
