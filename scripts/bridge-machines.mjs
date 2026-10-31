/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-machines.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The own-machines routes (own-machines-plan.md, "API contract", devil verdict 2026-10-31).
// Three routes are called by osionos-node, server to server, and authenticate by the machine's
// signature: they answer without any CORS header, so a page on another origin cannot read them
// and no credential rides along. Every other route is an app-session route with the app CORS.
//
// Ownership answers follow the contract table: default, identity and delete say 404 for a row
// that is not the caller's, so the id is no probe; the token mint says 403 not_allowed, which is
// the refusal condition 1 names, for another account's row and for a revoked one.
import { accountAddress, accountError, callerSession, clientMetaOf, noContent, readBody, respondWithError } from './bridge-account-sudo.mjs';
import { clientAddress, clientMeta, requireSudo, writeAudit } from './bridge-guard.mjs';
import { writeJsonResponse } from './bridge-json-response.mjs';
import { sendJson } from './bridge-social-core.mjs';
import { fromB64url, verifyMessage } from './ide-agent-frames.mjs';
import { heartbeatMessage, isLoopbackIdeOrigin, newMachineId, signMachineToken, whoamiMessage } from './ide-machine-protocol.mjs';
import { createMachinePairing } from './bridge-machines-pairing.mjs';
import { createSlidingLimiter } from './ide-relay-limits.mjs';
import { acceptHeartbeatTs, bridgeKeysOf, dropPresence, machineSetup, readPresence, writePresence } from './bridge-machines-presence.mjs';
import { MACHINE_CAP, countLiveMachines, insertMachine, listMachines, readMachine, readOwnedMachine, revokeMachine, setDefaultMachine } from './bridge-machines-store.mjs';

const PREFIX = '/api/machines';
const START = `${PREFIX}/pair/start`;
const POLL = `${PREFIX}/pair/poll`;
const HEARTBEAT = `${PREFIX}/heartbeat`;
const OPEN_PATHS = new Set([START, POLL, HEARTBEAT]);
const ITEM = /^\/api\/machines\/(m-[a-z2-7]{16})(?:\/(default|identity|token))?$/;
const MACHINE_ID = /^m-[a-z2-7]{16}$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
// A beat is due every 30 s, so 20 a minute is ten machines behind one address.
const BEATS_PER_CLIENT = 20;
const BEATS_GLOBAL = 2000;
const BEAT_WINDOW_MS = 60_000;
const IDENTITY_TTL_MS = 60_000;
const identityKey = (userId, id, ideOrigin) => `machine-identity-ok:${userId}:${id}:${ideOrigin}`;

const badRequest = (message = 'The request is malformed.') => accountError(400, 'bad_request', message);
const notFound = () => accountError(404, 'not_found', 'No such machine.');
const offline = () => accountError(409, 'offline', 'The machine is not online.');
const notAllowed = () => accountError(403, 'not_allowed', 'This machine is not yours to open.');
const wrongMethod = (method) => accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);

/** A reply with no CORS header at all: the node reads it, a browser page on any origin cannot. */
function openJson(response, status, body) {
	writeJsonResponse(response, status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body);
	return true;
}

function openError(response, error) {
	const status = Number.isInteger(error?.status) ? error.status : 500;
	const code = typeof error?.code === 'string' ? error.code : 'machines_request_failed';
	return openJson(response, status, { ok: false, code, message: error instanceof Error ? error.message : 'The request failed.' });
}

const openBody = (request) => readBody(request).catch(() => { throw badRequest(); });

/** The presence origin, re-checked on read so a bad kv value can never become a token audience. */
async function liveOrigin(kv, id) {
	const presence = await readPresence(kv, id);
	return presence && isLoopbackIdeOrigin(presence.ideOrigin) ? presence : null;
}

// Caveat: the beat limiters live in this process, like the pairing ones; behind a proxy without a
// client-IP header every node shares one per-client budget, so a crowd behind it goes offline first.
function createOpenRoutes({ config, pg, kv, pairing, now }) {
	const beatsPerClient = createSlidingLimiter({ limit: BEATS_PER_CLIENT, windowMs: BEAT_WINDOW_MS, now });
	const beatsGlobal = createSlidingLimiter({ limit: BEATS_GLOBAL, windowMs: BEAT_WINDOW_MS, now });
	const beatLimited = () => accountError(429, 'rate_limited', 'Too many heartbeats; try again later.', { retryAfterSeconds: BEAT_WINDOW_MS / 1000 });
	async function start(ctx) {
		const body = await openBody(ctx.request);
		const clientKey = clientAddress(ctx.request, { ipHeader: config.clientIpHeader });
		const startIp = clientMeta(ctx.request, { ipHeader: config.clientIpHeader }).ipPrefix;
		return openJson(ctx.response, 200, pairing.start(body, { origin: ctx.setup.origin, clientKey, startIp }));
	}
	async function poll(ctx) {
		const approved = pairing.poll(await openBody(ctx.request), { origin: ctx.setup.origin });
		if (!approved) return openJson(ctx.response, 202, { status: 'pending' });
		return openJson(ctx.response, 200, { ...approved, bridgeKeys: bridgeKeysOf(ctx.setup) });
	}
	// Unknown and revoked ids are one answer, so a heartbeat is no probe of what exists (condition 6).
	async function heartbeat(ctx) {
		const { machineId, ideOrigin, ts, sig } = await openBody(ctx.request);
		if (typeof machineId !== 'string' || !MACHINE_ID.test(machineId) || !isLoopbackIdeOrigin(ideOrigin)) throw badRequest();
		const clientKey = clientAddress(ctx.request, { ipHeader: config.clientIpHeader });
		if ((clientKey && !beatsPerClient.take(clientKey)) || !beatsGlobal.take('global')) throw beatLimited();
		const row = await readMachine({ pg, id: machineId });
		if (!row || row.revoked_at != null) throw accountError(410, 'gone', 'This machine is not paired.');
		const message = heartbeatMessage({ origin: ctx.setup.origin, machineId, ideOrigin, ts });
		if (!verifyMessage(fromB64url(row.pubkey), message, sig)) throw accountError(401, 'bad_signature', 'The signature does not verify.');
		await acceptHeartbeatTs(kv, machineId, ts, ctx.now);
		await writePresence(kv, machineId, { ideOrigin, ts, now: ctx.now });
		return openJson(ctx.response, 200, { bridgeKeys: bridgeKeysOf(ctx.setup) });
	}
	return { [START]: start, [POLL]: poll, [HEARTBEAT]: heartbeat };
}

// Approves of one user run one after another, so two in flight cannot both pass the count and
// write a sixth row. Caveat: per process; two bridge replicas would each hold their own queue.
function createUserQueue() {
	const tails = new Map();
	return (userId, task) => {
		const run = (tails.get(userId) ?? Promise.resolve()).then(task);
		const tail = run.catch(() => {});
		tails.set(userId, tail);
		void tail.then(() => { if (tails.get(userId) === tail) tails.delete(userId); });
		return run;
	};
}

function createPairingRoutes({ config, pg, kv, pairing, fetchImpl }) {
	const oneAtATime = createUserQueue();
	async function claim(ctx, session) {
		await requireSudo(kv, session);
		const { code } = await readBody(ctx.request);
		const entry = pairing.claim(session.userId, code);
		const yourIp = clientMeta(ctx.request, { ipHeader: config.clientIpHeader }).ipPrefix;
		const { pairId, name, platform, fingerprint, startIp } = entry;
		return sendJson(ctx.response, 200, { pairId, name, platform, fingerprint, startIp, yourIp }, config);
	}
	async function writeRow(ctx, session, entry) {
		if (await countLiveMachines({ pg, userId: session.userId }) >= MACHINE_CAP) throw accountError(409, 'machine_cap', `At most ${MACHINE_CAP} machines per account.`);
		const accountEmail = await accountAddress({ config, fetchImpl }, session.userId);
		const id = newMachineId();
		await writeAudit(pg, { session, meta: clientMetaOf(ctx.request, config), eventType: 'machine.paired', details: { machine: id, fingerprint: entry.fingerprint } });
		const row = { id, user_id: session.userId, name: entry.name, platform: entry.platform, pubkey: entry.pubkey, fingerprint: entry.fingerprint, is_default: false };
		await insertMachine({ pg, row });
		return { machineId: id, ownerId: session.userId, accountEmail };
	}
	async function approve(ctx, session) {
		await requireSudo(kv, session);
		const { pairId } = await readBody(ctx.request);
		const entry = pairing.reserve(session.userId, pairId);
		try {
			const approved = await oneAtATime(session.userId, () => writeRow(ctx, session, entry));
			pairing.markApproved(entry, approved);
			return sendJson(ctx.response, 201, { id: approved.machineId }, config);
		} catch (error) {
			pairing.release(entry);
			throw error;
		}
	}
	async function decline(ctx, session) {
		const { pairId } = await readBody(ctx.request);
		pairing.decline(session.userId, pairId);
		return noContent(ctx.response, config);
	}
	return { claim, approve, decline };
}

function createItemRoutes({ config, pg, kv }) {
	async function list(ctx, session) {
		const rows = await listMachines({ pg, session });
		const machines = await Promise.all(rows.map(async (row) => {
			const presence = await liveOrigin(kv, row.id);
			return {
				id: row.id, name: row.name, platform: row.platform, fingerprint: row.fingerprint, isDefault: row.is_default === true,
				online: presence !== null, ideOrigin: presence?.ideOrigin ?? null, lastSeenAt: presence?.lastSeenAt ?? null,
			};
		}));
		// The web app reaches the bridge through its own proxy and the desktop app directly, so the
		// app cannot know which origin the pairing signatures must name; the bridge says.
		return sendJson(ctx.response, 200, { machines, bridgeOrigin: ctx.setup.origin }, config);
	}
	async function makeDefault(ctx, session, id) {
		if (!(await readOwnedMachine({ pg, id, userId: session.userId }))) throw notFound();
		if (!(await setDefaultMachine({ pg, userId: session.userId, id }))) throw notFound();
		return noContent(ctx.response, config);
	}
	async function remove(ctx, session, id) {
		await requireSudo(kv, session);
		if (!(await readOwnedMachine({ pg, id, userId: session.userId }))) throw notFound();
		await writeAudit(pg, { session, meta: clientMetaOf(ctx.request, config), eventType: 'machine.revoked', details: { machine: id } });
		if (!(await revokeMachine({ pg, userId: session.userId, id, now: ctx.now }))) throw notFound();
		await dropPresence(kv, id);
		return noContent(ctx.response, config);
	}
	// The browser cannot tell which process holds a loopback port; the machine key can (condition 5).
	async function identity(ctx, session, id) {
		const { nonce, sig } = await readBody(ctx.request);
		if (typeof nonce !== 'string' || !NONCE.test(nonce) || typeof sig !== 'string') throw badRequest();
		const row = await readOwnedMachine({ pg, id, userId: session.userId });
		if (!row) throw notFound();
		const presence = await liveOrigin(kv, id);
		if (!presence) throw offline();
		const message = whoamiMessage({ origin: ctx.setup.origin, machineId: id, ideOrigin: presence.ideOrigin, nonce });
		if (!verifyMessage(fromB64url(row.pubkey), message, sig)) throw accountError(422, 'identity_mismatch', 'The process on that port is not this machine.');
		await kv.set(identityKey(session.userId, id, presence.ideOrigin), '1', IDENTITY_TTL_MS);
		return sendJson(ctx.response, 200, { ok: true }, config);
	}
	async function token(ctx, session, id) {
		await requireSudo(kv, session);
		const row = await readMachine({ pg, id });
		if (!row) throw notFound();
		if (row.user_id !== session.userId || row.revoked_at != null) throw notAllowed();
		const presence = await liveOrigin(kv, id);
		if (!presence) throw offline();
		// One identity check buys one mint, for this origin, within 60 s (condition 5).
		if (await kv.getDel(identityKey(session.userId, id, presence.ideOrigin)) !== '1') {
			throw accountError(428, 'identity_required', 'Check the machine\'s identity first.');
		}
		const minted = signMachineToken({ sub: session.userId, machine: id, aud: presence.ideOrigin, seed: ctx.setup.seed, now: ctx.now });
		return sendJson(ctx.response, 200, minted, config);
	}
	return { list, makeDefault, remove, identity, token };
}

/** The dispatch of one session route: the path picks the handler, the method must match it. */
function sessionHandler(pathname, method, { pairingRoutes, items }) {
	const expect = (wanted, handler) => (method === wanted ? handler : () => { throw wrongMethod(method); });
	if (pathname === PREFIX) return expect('GET', items.list);
	const pair = /^\/api\/machines\/pair\/(claim|approve|decline)$/.exec(pathname);
	if (pair) return expect('POST', pairingRoutes[pair[1]]);
	const item = ITEM.exec(pathname);
	if (!item) return () => { throw notFound(); };
	const [, id, action] = item;
	const handler = { undefined: expect('DELETE', items.remove), default: expect('PUT', items.makeDefault), identity: expect('POST', items.identity), token: expect('POST', items.token) }[action];
	return (ctx, session) => handler(ctx, session, id);
}

/** Answers true when it handled the request and false when the path is not its own. */
export function createMachineRoutes({ config, pg, kv, verifySession, env = process.env, fetchImpl = null, now = null }) {
	const clock = typeof now === 'function' ? now : () => Date.now();
	const call = typeof fetchImpl === 'function' ? fetchImpl : (url, init) => globalThis.fetch(url, init);
	const pairing = createMachinePairing({ now: clock });
	const open = createOpenRoutes({ config, pg, kv, pairing, now: clock });
	const routes = { pairingRoutes: createPairingRoutes({ config, pg, kv, pairing, fetchImpl: call }), items: createItemRoutes({ config, pg, kv }) };
	return async function handleMachines(url, request, response) {
		const { pathname } = url;
		if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) return false;
		const method = (request.method || 'GET').toUpperCase();
		const isOpen = OPEN_PATHS.has(pathname);
		try {
			const ctx = { setup: machineSetup(config, env), request, response, now: clock() };
			if (isOpen) {
				if (method !== 'POST') throw wrongMethod(method);
				return await open[pathname](ctx);
			}
			const session = callerSession(request, config, verifySession);
			return await sessionHandler(pathname, method, routes)(ctx, session);
		} catch (error) {
			return isOpen ? openError(response, error) : respondWithError(response, error, config);
		}
	};
}
