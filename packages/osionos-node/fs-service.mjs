/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fs-service.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The editor page's disk (devil verdict 2026-11-01 editor on disk, F4-F13, F17; groot ADR 0044). The
// node's own /editor/ page opens `ws://<node>/api/fs`; the upgrade needs the node's exact Origin, and
// the first message is the owner's bridge-signed token or this service's session secret, through
// the gate /api/pty shares (node-credentials.mjs), plus the app origin the page pinned. Then each
// message is one request on the folders that app origin opened. A socket lives until it closes, the
// node stops, or the owner is revoked; its watches and staged save die with it.
// Caveat: an op that outlives its 10 s is answered Interrupted but keeps its node-wide slot until
// the disk returns, so a hung network mount (sshfs, NFS) stops the editor's disk access while it
// hangs; at most 2 of the threadpool's 4 threads (node's default) are ever the editor's, so shells
// and the rest of the node keep working.
import { realpath } from 'node:fs/promises';
import { relative } from 'node:path';

import { checkNodeOrigin } from '../../scripts/ide-node-policy.mjs';
import { refuseRaw } from './node-proxy.mjs';
import { createCredentialGate } from './node-credentials.mjs';
import { FS_CLOSE, FS_LIMITS, readFsAuth, readFsRequest } from './fs-wire.mjs';
import { fsFail } from './fs-errors.mjs';
import { resolveTarget } from './fs-confine.mjs';
import * as diskOps from './fs-ops.mjs';
import { createStagedSaves, save } from './fs-save.mjs';
import { createWatchHub } from './fs-watch.mjs';

const GOING_AWAY = 1001;

/** At most `size` tasks at once; the rest wait their turn. */
export function createLimiter(size) {
	let running = 0;
	const waiting = [];
	const next = () => { if (running < size && waiting.length) { running += 1; waiting.shift()(); } };
	return {
		run(task) {
			return new Promise((resolve, reject) => {
				waiting.push(() => Promise.resolve().then(task).then(resolve, reject).finally(() => { running -= 1; next(); }));
				next();
			});
		},
		running: () => running,
	};
}

export function createFsService({ ideOrigin, ownerId, verifySession, isRevoked, accept, roots, home, appOrigins, ops = { ...diskOps, save }, hub = createWatchHub(), newSecret, opTimeoutMs = 10_000, nodeWide = createLimiter(2) }) {
	const pending = new Set();
	const live = new Set();
	const gate = createCredentialGate({ ideOrigin, ownerId, verifySession, isRevoked, newSecret });
	const realHome = () => realpath(home);
	const label = async (record) => { const rel = relative(await realHome(), record.realpath); return rel && !rel.startsWith('..') ? `~/${rel}` : record.realpath; };

	async function loadRoots(record) {
		const listed = await roots.list(record.appOrigin);
		record.roots = new Map(listed.map((root) => [root.id, root.realpath]));
		return Promise.all(listed.map(async (root) => ({ id: root.id, label: await label(root) })));
	}

	function rootOf(record, id) {
		const real = record.roots.get(id);
		if (!real) throw fsFail('NotFound');
		return real;
	}

	async function watch(record, root, rel) {
		const dir = await resolveTarget(root, rel);
		const id = record.watches.add(dir);
		if (id === null) throw fsFail('NoSpace');
		return { watch: id };
	}

	async function write(record, request) {
		const step = record.saves.take(request);
		if (!step.commit) return { received: step.received };
		const { root, rel, bytes, options } = step.commit;
		await ops.save(rootOf(record, root), rel, bytes, options);
		return { saved: bytes.length };
	}

	const PERFORM = {
		list: (r, q) => ops.list(rootOf(r, q.root), q.rel),
		stat: (r, q) => ops.stat(rootOf(r, q.root), q.rel),
		read: (r, q) => ops.read(rootOf(r, q.root), q.rel, q.offset, q.length),
		write,
		mkdir: (r, q) => ops.mkdir(rootOf(r, q.root), q.rel).then(() => ({})),
		rename: (r, q) => ops.rename(rootOf(r, q.root), q.rel, q.to, q.overwrite).then(() => ({})),
		delete: (r, q) => ops.remove(rootOf(r, q.root), q.rel, q.recursive).then(() => ({})),
		watch: (r, q) => watch(r, rootOf(r, q.root), q.rel),
		unwatch: async (r, q) => { r.watches.remove(q.watch); return {}; },
		pick: async (r, q) => ops.pick(await realHome(), q.rel, q.hidden),
		roots: async (r) => ({ roots: await loadRoots(r) }),
		addRoot: async (r, q) => {
			const added = await roots.add(await resolveTarget(await realHome(), q.rel), r.appOrigin);
			await loadRoots(r);
			return { root: { id: added.id, label: await label(added) } };
		},
		removeRoot: async (r, q) => { await roots.remove(q.root, r.appOrigin); await loadRoots(r); return {}; },
	};

	const send = (record, message) => { if (!record.ended) record.conn.send(JSON.stringify(message)); };

	// Answered within opTimeoutMs of starting, whatever the disk does; the slot is the disk's until it returns.
	function start(record, request) {
		record.inFlight += 1;
		let answered = false;
		const answer = (message) => {
			if (answered) return;
			answered = true;
			clearTimeout(timer);
			record.inFlight -= 1;
			send(record, { id: request.id, ...message });
			drain(record);
		};
		const timer = setTimeout(() => answer({ error: 'Interrupted' }), opTimeoutMs);
		nodeWide.run(() => (record.ended ? null : PERFORM[request.op](record, request)))
			.then((result) => answer({ ok: true, ...result }), (error) => answer({ error: fsFail(error).wireCode }));
	}

	function drain(record) {
		while (!record.ended && record.inFlight < FS_LIMITS.inFlightPerSocket && record.queue.length) start(record, record.queue.shift());
	}

	function onMessage(record, data, isBinary) {
		const request = isBinary ? null : readFsRequest(data.toString('utf8'));
		if (!request) return record.conn.close(FS_CLOSE.protocol);
		if (record.queue.length >= FS_LIMITS.queuedPerSocket) return record.conn.close(FS_CLOSE.full);
		record.queue.push(request);
		drain(record);
	}

	function end(record) {
		if (record.ended) return;
		record.ended = true;
		live.delete(record);
		record.queue.length = 0;
		record.watches.closeAll();
		record.saves.drop();
		gate.leave(record.session, record.conn);
	}

	function open(conn, auth) {
		if (!appOrigins.includes(auth.appOrigin)) return conn.close(FS_CLOSE.auth);
		const found = gate.admit(auth);
		if (!found) return conn.close(FS_CLOSE.auth);
		if (live.size >= FS_LIMITS.maxSockets) return conn.close(FS_CLOSE.full);
		const record = {
			conn, session: found, appOrigin: auth.appOrigin, roots: new Map(), ended: false, inFlight: 0, queue: [],
			watches: hub.forSocket((message) => send(record, message)), saves: createStagedSaves(),
		};
		live.add(record);
		conn.on('message', (data, isBinary) => onMessage(record, data, isBinary));
		conn.on('close', () => end(record));
		send(record, gate.join(found, conn) ? { op: 'opened', secret: found.secret } : { op: 'opened' });
	}

	/** A socket that passed the upgrade: it has 5 s and 4 KiB to open. */
	function attach(conn) {
		const waiting = { conn };
		pending.add(waiting);
		const leave = () => { clearTimeout(timer); pending.delete(waiting); };
		const timer = setTimeout(() => { leave(); conn.close(FS_CLOSE.auth); }, FS_LIMITS.authWindowMs);
		conn.once('close', leave);
		conn.once('message', (data, isBinary) => {
			leave();
			conn.off('close', leave);
			const auth = isBinary ? null : readFsAuth(data.toString('utf8'));
			if (!auth) return conn.close(FS_CLOSE.auth);
			open(conn, auth);
		});
	}

	async function upgrade(req, socket, head) {
		if (!checkNodeOrigin(req.headers, ideOrigin, true)) return refuseRaw(socket, 403, 'Forbidden.');
		if (pending.size >= FS_LIMITS.maxPending) return refuseRaw(socket, 429, 'Too many editor connections.');
		const placeholder = { conn: null };
		pending.add(placeholder);
		let conn;
		try { conn = await accept(req, socket, head); } catch { conn = null; } finally { pending.delete(placeholder); }
		if (conn) attach(conn);
		else socket.destroy();
	}

	function killAll() {
		for (const waiting of [...pending]) waiting.conn?.close(GOING_AWAY);
		pending.clear();
		for (const record of [...live]) { end(record); record.conn.close(GOING_AWAY); }
		gate.clear();
	}

	return { upgrade, attach, killAll, counts: () => ({ pending: pending.size, sockets: live.size, sessions: gate.size(), watches: hub.count() }) };
}
