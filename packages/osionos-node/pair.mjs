/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pair.mjs                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `osionos-node pair`: device-code pairing (own-machines plan, devil 2026-10-31, 4). The machine
// makes its key, shows a code and its fingerprint, and keeps the result only after its owner
// accepts the account that approved it, so a code someone tricked a user into approving cannot
// silently bind this machine to the wrong account.
import { fingerprint, generateAgentKeyPair, signMessage, b64url } from '../../scripts/ide-agent-frames.mjs';
import { pairPollMessage, pairStartMessage } from '../../scripts/ide-machine-protocol.mjs';
import { saveMachine } from './machine-identity.mjs';

const VERSION = '1.0.0';
const NAME = /^[A-Za-z0-9._-]{1,64}$/;

async function post(fetchImpl, bridge, path, body) {
	const res = await fetchImpl(`${bridge}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	return { status: res.status, body: await res.json().catch(() => ({})) };
}

// Caveat: polls until the code's own 300 s life ends; the interval is the bridge's, floored at 0
// for tests, so a bridge that answers interval 0 is polled as fast as it replies.
async function pollUntilApproved({ fetchImpl, bridge, pairId, privateKey, interval, sleep }) {
	const deadline = Date.now() + 300_000;
	while (Date.now() < deadline) {
		const ts = Date.now();
		const sig = signMessage(privateKey, pairPollMessage({ origin: bridge, pairId, ts }));
		const { status, body } = await post(fetchImpl, bridge, '/api/machines/pair/poll', { pairId, ts, sig });
		if (status === 200) return body;
		if (status === 410) throw new Error('the pairing was declined in the app');
		if (status !== 202) throw new Error(`the bridge refused the pairing (${status} ${body.code ?? ''})`.trim());
		await sleep(interval * 1000);
	}
	throw new Error('the code expired before it was approved; run pair again');
}

export async function pairMachine({ bridge, name, file, platform, fetchImpl = fetch, say = console.log, confirm, acceptAccount, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
	if (!NAME.test(name ?? '')) throw new Error('--name must be 1-64 letters, digits, dot, dash or underscore');
	const origin = new URL(bridge).origin;
	const { privateKey, publicKeyRaw } = generateAgentKeyPair();
	const pubkey = b64url(publicKeyRaw);
	const ts = Date.now();
	const sig = signMessage(privateKey, pairStartMessage({ origin, pubkey, name, ts }));
	const start = await post(fetchImpl, origin, '/api/machines/pair/start', { pubkey, name, platform, version: VERSION, ts, sig });
	if (start.status !== 200) throw new Error(`the bridge refused to start pairing (${start.status} ${start.body.code ?? ''})`.trim());
	say(`Open osionos → Settings → Machines → Add a machine, and enter: ${start.body.code}`);
	say(`Check that the app shows this fingerprint: ${fingerprint(publicKeyRaw)}`);
	const approved = await pollUntilApproved({ fetchImpl, bridge: origin, pairId: start.body.pairId, privateKey, interval: start.body.interval ?? 5, sleep });
	say(`Approved by the account ${approved.accountEmail}.`);
	if (acceptAccount !== undefined) {
		if (approved.accountEmail !== acceptAccount) throw new Error(`approved by ${approved.accountEmail}, not ${acceptAccount}; nothing was saved`);
	} else if (!(await confirm(`Give ${approved.accountEmail} access to this machine's files and terminal? [y/N] `))) {
		throw new Error('declined on this machine; nothing was saved');
	}
	const machine = {
		machineId: approved.machineId, ownerId: approved.ownerId, accountEmail: approved.accountEmail, bridgeUrl: origin,
		bridgeKeys: Object.fromEntries(approved.bridgeKeys.map(({ kid, publicKey }) => [kid, publicKey])),
		privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
	};
	saveMachine(file, machine);
	say(`Paired as ${machine.machineId}. Start it with: osionos-node serve`);
	return machine;
}
