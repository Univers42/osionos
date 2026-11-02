/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   node-credentials.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The one credential gate of the node's own pages' sockets (devil verdict 2026-11-01 editor on disk,
// F5; groot ADR 0041, ADR 0044). /api/pty and /api/fs admit a frame through the same check: the
// owner's bridge-signed token, spent once through the shared verifySession (one jti guard for the
// node, so a token spent on either route is refused by the other), or the session secret this gate
// gave that frame. Each service holds its own gate, so a secret opens only the service that issued
// it. A session lives while one of its sockets is open; the last close forgets it.
import { createHash, randomBytes } from 'node:crypto';

const secretKey = (secret) => createHash('sha256').update(secret).digest('hex');
const freshSecret = () => randomBytes(32).toString('base64url');

/** `auth` is the wire's opening: `{ kind: 'token', token }` or `{ kind: 'secret', secret }`. */
export function createCredentialGate({ ideOrigin, ownerId, verifySession, isRevoked, newSecret = freshSecret }) {
	// One per frame, keyed by the secret's hash so a lookup never compares the secret itself.
	const sessions = new Map();

	/** The session this opening names, or null. A token yields a fresh session, kept only on `join`. */
	function admit(auth) {
		if (auth.kind === 'secret') return sessions.get(secretKey(auth.secret)) ?? null;
		let token;
		try { token = verifySession(auth.token, { ideOrigin }); } catch { return null; }
		if (token.userId !== ownerId || isRevoked(token.userId, token.iat)) return null;
		const secret = newSecret();
		return { secret, key: secretKey(secret), conns: new Set(), fresh: true };
	}

	/** Binds an open socket to its session; true when the frame must be told the new secret. */
	function join(session, conn) {
		const isNew = session.fresh;
		if (isNew) { session.fresh = false; sessions.set(session.key, session); }
		session.conns.add(conn);
		return isNew;
	}

	function leave(session, conn) {
		if (!session) return;
		session.conns.delete(conn);
		if (session.conns.size === 0) sessions.delete(session.key);
	}

	return { admit, join, leave, clear: () => sessions.clear(), size: () => sessions.size };
}
