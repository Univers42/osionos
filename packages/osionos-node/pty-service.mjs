/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pty-service.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The web terminal's shells (devil verdict 2026-11-01, W2-W5, W8, U6; groot ADR 0041). The node's
// own terminal page opens `ws://<node>/api/pty` per shell. The upgrade needs the node's exact Origin;
// the first message is the owner's bridge-signed token, spent once through the same verifySession
// (the same jti guard) as /api/node/session, or the session secret this node gave that frame on its
// first shell. The token gates the opening, not the life: a shell lives until its socket closes,
// the node stops, or the owner is revoked. `conn` is the slice of ws's WebSocket used here.
import { createHash, randomBytes } from 'node:crypto';

import { checkNodeOrigin } from '../../scripts/ide-node-policy.mjs';
import { PTY_CLOSE, PTY_LIMITS, readPtyAuth, readPtyCommand } from './pty-wire.mjs';
import { refuseRaw } from './node-proxy.mjs';

const GOING_AWAY = 1001;
const secretKey = (secret) => createHash('sha256').update(secret).digest('hex');

export function createPtyService({ ideOrigin, ownerId, verifySession, isRevoked, host, accept, newSecret = () => randomBytes(32).toString('base64url') }) {
	const pending = new Set();
	const live = new Set();
	// One per frame, keyed by the secret's hash so a lookup never compares the secret itself.
	const sessions = new Map();

	function credentialSession(auth) {
		if (auth.kind === 'secret') return sessions.get(secretKey(auth.secret)) ?? null;
		let token;
		try { token = verifySession(auth.token, { ideOrigin }); } catch { return null; }
		if (token.userId !== ownerId || isRevoked(token.userId, token.iat)) return null;
		const secret = newSecret();
		return { secret, key: secretKey(secret), conns: new Set(), fresh: true };
	}

	function leaveSession(record) {
		const { session } = record;
		if (!session) return;
		session.conns.delete(record.conn);
		if (session.conns.size === 0) sessions.delete(session.key);
	}

	function end(record) {
		if (record.ended) return;
		record.ended = true;
		live.delete(record);
		leaveSession(record);
		try { record.shell?.kill(); } catch { /* the pty already exited */ }
	}

	function apply(record, data, isBinary) {
		const command = isBinary ? null : readPtyCommand(data.toString('utf8'));
		if (!command || !record.shell) return record.conn.close(PTY_CLOSE.protocol);
		try {
			if (command.op === 'write') record.shell.write(command.data);
			else if (command.op === 'resize') record.shell.resize(command.cols, command.rows);
			else record.shell.ack(command.chars);
		} catch { /* a write after exit; the exit closes the socket */ }
	}

	async function open(conn, auth) {
		const found = credentialSession(auth);
		if (!found) return conn.close(PTY_CLOSE.auth);
		if (live.size >= PTY_LIMITS.maxShells) return conn.close(PTY_CLOSE.full);
		// Reserved before the spawn, so eight openings in flight cannot become nine shells.
		const record = { conn, shell: null, session: null, ended: false };
		live.add(record);
		conn.on('message', (data, isBinary) => apply(record, data, isBinary));
		conn.on('close', () => end(record));
		const send = (message) => { if (!record.ended) conn.send(JSON.stringify(message)); };
		// The frame reads nothing before `opened`, and a shell writes as soon as it starts (its prompt,
		// a cursor-position query it then waits on), so its output waits here until `opened` has gone.
		let early = [];
		const toFrame = (message) => { if (early) early.push(message); else send(message); };
		let shell;
		try {
			shell = await host.spawn({ cols: auth.cols, rows: auth.rows }, {
				data: (data) => toFrame({ op: 'data', data }),
				exit: (exitCode) => { toFrame({ op: 'exit', exitCode }); if (!early) conn.close(1000); },
			});
		} catch { shell = null; }
		if (record.ended) return shell?.kill();
		if (!shell) { end(record); return conn.close(PTY_CLOSE.unavailable); }
		record.shell = shell;
		if (found.fresh) { found.fresh = false; sessions.set(found.key, found); }
		record.session = found;
		found.conns.add(conn);
		send(auth.kind === 'token' ? { op: 'opened', secret: found.secret } : { op: 'opened' });
		const held = early;
		early = null;
		for (const message of held) send(message);
		if (held.some((message) => message.op === 'exit')) conn.close(1000);
	}

	/** A socket that passed the upgrade: it has 5 s and 4 KiB to open a shell. */
	function attach(conn) {
		const waiting = { conn };
		pending.add(waiting);
		const leave = () => { clearTimeout(timer); pending.delete(waiting); };
		const timer = setTimeout(() => { leave(); conn.close(PTY_CLOSE.auth); }, PTY_LIMITS.authWindowMs);
		conn.once('close', leave);
		conn.once('message', (data, isBinary) => {
			leave();
			conn.off('close', leave);
			const auth = isBinary ? null : readPtyAuth(data.toString('utf8'));
			if (!auth) return conn.close(PTY_CLOSE.auth);
			void open(conn, auth);
		});
	}

	async function upgrade(req, socket, head) {
		if (!checkNodeOrigin(req.headers, ideOrigin, true)) return refuseRaw(socket, 403, 'Forbidden.');
		if (pending.size >= PTY_LIMITS.maxPending) return refuseRaw(socket, 429, 'Too many terminal connections.');
		// Counted from here, so four upgrades still being accepted already fill the queue.
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
		sessions.clear();
	}

	return { upgrade, attach, killAll, counts: () => ({ pending: pending.size, shells: live.size, sessions: sessions.size }) };
}
