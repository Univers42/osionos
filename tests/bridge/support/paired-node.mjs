// What every paired-node test starts from: a machine identity trusting one bridge key, and a free
// loopback origin for the node to serve on. Three suites built these by hand before.
import http from 'node:http';

import { generateAgentKeyPair } from '../../../scripts/ide-agent-frames.mjs';

export const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
export const MACHINE = 'm-abcdefghijklmnop';

/** A machine.json body paired to OWNER, trusting `key` (bridgeKeyFromSeed) and nothing else. */
export function pairedMachine(key, bridgeUrl = 'https://bridge.example') {
	const { privateKey } = generateAgentKeyPair();
	return {
		machineId: MACHINE, ownerId: OWNER, bridgeUrl, bridgeKeys: { [key.kid]: key.publicKey },
		privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
	};
}

// Caveat: the port is free when probed, not when the node binds it; another process taking it in
// between fails that test with EADDRINUSE, never a false pass.
export async function freeLoopbackOrigin() {
	const probe = http.createServer();
	await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
	const { port } = probe.address();
	await new Promise((resolve) => probe.close(resolve));
	return { port, origin: `http://127.0.0.1:${port}` };
}
