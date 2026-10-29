/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-invite-store.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The osionos_workspace_invites table behind the invite routes: PostgREST calls, token
 * hashing and expiry. Routing and permissions stay in bridge-workspace-invites.mjs.
 *
 * The token is a bearer secret: 256 random bits, handed to the inviter once, and only its
 * sha256 hex is stored — a database read cannot be replayed as an accept.
 */

import { createHash, randomBytes } from 'node:crypto';

import { rest } from './bridge-social-core.mjs';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// The shape newToken() mints; anything else is not a token and is never looked up.
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

const TABLE = 'osionos_workspace_invites';
const PUBLIC_COLUMNS = 'id,email,role,invited_by,expires_at,created_at,accepted_at,revoked_at,declined_at';
// What /mine may hold in memory: no email, no token_hash, no invited_user_id.
const MINE_COLUMNS = 'id,workspace_id,role,invited_by,expires_at,created_at,accepted_at,revoked_at,declined_at';
const UI_ROLE = new Map([['admin', 'admin'], ['editor', 'member'], ['viewer', 'guest']]);

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

export function newToken() {
	const token = randomBytes(32).toString('base64url');
	return { token, hash: hashToken(token) };
}

/** The columns the client shows — never token_hash, never the invited user's id. */
export function publicInvite(row) {
	return {
		id: row.id,
		email: row.email,
		role: UI_ROLE.get(row.role) ?? 'guest',
		invitedBy: row.invited_by,
		expiresAt: row.expires_at,
		createdAt: row.created_at,
		acceptedAt: row.accepted_at ?? null,
		revokedAt: row.revoked_at ?? null,
		declinedAt: row.declined_at ?? null,
	};
}

const first = (rows) => (Array.isArray(rows) ? rows[0] ?? null : null);
const LIVE = 'accepted_at=is.null&revoked_at=is.null';

/** Newest first. Caveat: capped at 200 rows, a workspace with more shows only the latest. */
export async function listInvites(config, fetchImpl, workspaceId) {
	const rows = await rest(config, fetchImpl, `${TABLE}?workspace_id=eq.${workspaceId}&select=${PUBLIC_COLUMNS}&order=created_at.desc&limit=200`);
	// The sort keeps the order a property of this module, not of the transport.
	return (Array.isArray(rows) ? rows : []).sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
}

/** A live (pending) invite of this workspace by id, or null. */
export async function findLiveInvite(config, fetchImpl, workspaceId, inviteId) {
	return first(await rest(config, fetchImpl, `${TABLE}?id=eq.${inviteId}&workspace_id=eq.${workspaceId}&${LIVE}&select=*&limit=1`));
}

export async function findInviteByToken(config, fetchImpl, token) {
	return first(await rest(config, fetchImpl, `${TABLE}?token_hash=eq.${hashToken(token)}&select=*&limit=1`));
}

/**
 * The invitee's row by id. Deliberately NOT filtered by LIVE: acceptInviteRow must answer a
 * used, declined or revoked row exactly as the token route does, not as an unknown id.
 */
export async function findInviteForUser(config, fetchImpl, inviteId, userId) {
	return first(await rest(config, fetchImpl, `${TABLE}?id=eq.${inviteId}&invited_user_id=eq.${userId}&select=*&limit=1`));
}

/**
 * The inbox read: this account's live, unexpired invites, newest first.
 * Caveat: capped at 50; an invitee with more sees only the newest 50.
 */
export async function listLiveInvitesForUser(config, fetchImpl, userId, now = new Date()) {
	const rows = await rest(
		config,
		fetchImpl,
		`${TABLE}?invited_user_id=eq.${userId}&${LIVE}&expires_at=gt.${now.toISOString()}&select=${MINE_COLUMNS}&order=created_at.desc&limit=50`,
	);
	// The sort keeps newest-first a property of this module, not of the transport.
	return (Array.isArray(rows) ? rows : []).sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
}

/**
 * Create the pending invite, or replace the live one for the same account (new token, new
 * expiry: the old token stops working). SELECT then UPDATE/INSERT, not an upsert: PostgREST's
 * on_conflict cannot name a partial index (42P10); the index only refuses a racing second row.
 * Returns {row, token} — the plaintext exists only here.
 */
export async function saveInvite(config, fetchImpl, { workspaceId, email, inviteeId, role, invitedBy }) {
	const { token, hash } = newToken();
	const now = new Date();
	const fields = {
		email,
		role,
		invited_by: invitedBy,
		token_hash: hash,
		expires_at: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
		updated_at: now.toISOString(),
	};
	const live = first(await rest(config, fetchImpl, `${TABLE}?workspace_id=eq.${workspaceId}&invited_user_id=eq.${inviteeId}&${LIVE}&select=id&limit=1`));
	const rows = live
		? await rest(config, fetchImpl, `${TABLE}?id=eq.${live.id}&${LIVE}`, { method: 'PATCH', body: fields, prefer: 'return=representation' })
		: await rest(config, fetchImpl, TABLE, {
			method: 'POST',
			body: { workspace_id: workspaceId, invited_user_id: inviteeId, created_at: now.toISOString(), ...fields },
			prefer: 'return=representation',
		});
	return { row: first(rows), token };
}

/** Rotate a live invite's token and push its expiry out. Returns {row, token}. */
export async function rotateInvite(config, fetchImpl, invite) {
	const { token, hash } = newToken();
	const now = new Date();
	const rows = await rest(config, fetchImpl, `${TABLE}?id=eq.${invite.id}&${LIVE}`, {
		method: 'PATCH',
		body: { token_hash: hash, expires_at: new Date(now.getTime() + INVITE_TTL_MS).toISOString(), updated_at: now.toISOString() },
		prefer: 'return=representation',
	});
	return { row: first(rows), token };
}

export async function revokeInvite(config, fetchImpl, inviteId) {
	const now = new Date().toISOString();
	await rest(config, fetchImpl, `${TABLE}?id=eq.${inviteId}&${LIVE}`, {
		method: 'PATCH',
		body: { revoked_at: now, updated_at: now },
		prefer: 'return=minimal',
	});
}

/** Stamp the acceptance; answers false when another request got there first. */
export async function markAccepted(config, fetchImpl, inviteId, userId) {
	const now = new Date().toISOString();
	const rows = await rest(config, fetchImpl, `${TABLE}?id=eq.${inviteId}&${LIVE}`, {
		method: 'PATCH',
		body: { accepted_at: now, accepted_by: userId, updated_at: now },
		prefer: 'return=representation',
	});
	return Array.isArray(rows) && rows.length > 0;
}

/**
 * The invitee declines: one filtered PATCH on LIVE stamps revoked_at and declined_at together,
 * so a racing accept cannot win. Zero rows means it was not live (or not theirs) either way.
 */
export async function declineInvite(config, fetchImpl, inviteId, userId) {
	const now = new Date().toISOString();
	const rows = await rest(config, fetchImpl, `${TABLE}?id=eq.${inviteId}&invited_user_id=eq.${userId}&${LIVE}`, {
		method: 'PATCH',
		body: { revoked_at: now, declined_at: now, updated_at: now },
		prefer: 'return=representation',
	});
	return Array.isArray(rows) && rows.length > 0;
}
