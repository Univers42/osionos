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
//
// A gate given `devices` (remembered-computers.mjs) and `verifyResume` also admits a remembered
// computer (devil verdict 2026-11-01, Amendment 1): its device secret opens only beside a fresh
// bridge-signed resume assertion for the owner and this machine, spent through the same jti guard
// (R1, R3), and only under the app origin it was issued to (R4). A device secret is issued only on
// a token open whose token carries the person's remember choice (R6), never from a session secret
// or a remembered open, and never rotated on use: two tabs opening at once would lock each other out.
import { createHash, randomBytes } from 'node:crypto';

const secretKey = (secret) => createHash('sha256').update(secret).digest('hex');
const freshSecret = () => randomBytes(32).toString('base64url');

const isOwners = (claims, ownerId, isRevoked) => claims.userId === ownerId && !isRevoked(claims.userId, claims.iat);

/** `auth` is the wire's opening: `{ kind: 'token', token, appOrigin? }`, `{ kind: 'secret', secret }`
 *  or `{ kind: 'remembered', device, assertion, appOrigin }`. */
export function createCredentialGate({ ideOrigin, ownerId, verifySession, isRevoked, verifyResume = null, devices = null, newSecret = freshSecret }) {
	// One per frame, keyed by the secret's hash so a lookup never compares the secret itself.
	const sessions = new Map();
	const fresh = (rememberFor) => {
		const secret = newSecret();
		return { secret, key: secretKey(secret), conns: new Set(), fresh: true, rememberFor };
	};

	// The assertion first, so a stolen device secret tried with a replayed assertion still spends nothing new.
	function admitRemembered(auth) {
		if (!verifyResume || !devices) return null;
		let claims;
		try { claims = verifyResume(auth.assertion, { ideOrigin }); } catch { return null; }
		return isOwners(claims, ownerId, isRevoked) && devices.open(auth.device, auth.appOrigin) ? fresh(null) : null;
	}

	/** The session this opening names, or null. A token yields a fresh session, kept only on `join`. */
	function admit(auth) {
		if (auth.kind === 'secret') return sessions.get(secretKey(auth.secret)) ?? null;
		if (auth.kind === 'remembered') return admitRemembered(auth);
		let token;
		try { token = verifySession(auth.token, { ideOrigin }); } catch { return null; }
		if (!isOwners(token, ownerId, isRevoked)) return null;
		return fresh(token.remember === true && devices ? auth.appOrigin ?? null : null);
	}

	/** A device secret for a session that a remembering token just opened (R6), or null. */
	const issueDevice = (session) => (session.rememberFor ? devices.issue(session.rememberFor) : null);

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

	return { admit, join, leave, issueDevice, clear: () => sessions.clear(), size: () => sessions.size };
}
