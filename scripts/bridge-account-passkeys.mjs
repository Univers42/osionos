/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-passkeys.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * GET /api/account/passkeys | PATCH /api/account/passkeys/:id | DELETE /api/account/passkeys/:id.
 *
 * Management only: the passkeys themselves are registered and used by the control plane
 * (`public.webauthn_credentials`, migration 050). Here a signed-in user lists, renames and
 * removes their own. Every route needs an aal2 session (the shared verifier refuses an aal1
 * token with 403 `mfa_required`) and every read and write is filtered on `(user_id, tenant_id)`.
 * `tenant_id` is the bridge's `baasTenantId` (OSIONOS_BAAS_TENANT_ID), the value it already
 * sends as X-Baas-Tenant-Id; the control plane scopes by the same header, '' meaning untenanted.
 * Without PASSKEYS_ENABLED=1 every route answers 404 before any database call.
 * The public key, credential id and counter are never selected, so they cannot leave the bridge.
 * Caveat: rows written under another tenant value are invisible here, and a deployment that
 * changes OSIONOS_BAAS_TENANT_ID loses sight of its earlier passkeys until it is restored.
 * Caveat: a removed passkey also stops working for the next sign-in only; sessions it already
 * opened stay valid until they expire or are revoked.
 */

import { accountError, callerSession, clientMetaOf, readBody, respondWithError } from './bridge-account-sudo.mjs';
import { writeAudit } from './bridge-guard.mjs';
import { sendJson } from './bridge-social-core.mjs';

const TABLE = 'webauthn_credentials';
const COLUMNS = 'id,user_id,name,transports,created_at,last_used_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NICKNAME_MAX = 64;
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point.
const CONTROL = /[\u0000-\u001f\u007f]/;
const PATH = /^\/api\/account\/passkeys(?:\/([^/]+))?$/;

const unavailable = (error) => accountError(503, 'passkeys_unavailable', 'Passkeys are unavailable right now.', { cause: error });
const notFound = () => accountError(404, 'passkey_not_found', 'That passkey does not exist.');

function scope(ctx, userId, extra = {}) {
	return new URLSearchParams({ user_id: `eq.${userId}`, tenant_id: `eq.${ctx.config.baasTenantId ?? ''}`, ...extra });
}

async function guarded(operation) {
	try {
		return await operation();
	} catch (error) {
		throw unavailable(error);
	}
}

function present(row) {
	const transports = typeof row.transports === 'string' && row.transports !== '' ? row.transports.split(',') : [];
	return { _id: row.id, userId: row.user_id, transports, nickname: row.name ?? '', createdAt: row.created_at, updatedAt: row.last_used_at ?? row.created_at, lastUsedAt: row.last_used_at ?? null, removedAt: null };
}

function nicknameOf(body) {
	const text = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
	if (text === '' || text.length > NICKNAME_MAX || CONTROL.test(text)) throw accountError(422, 'invalid_nickname', `A passkey name is 1 to ${NICKNAME_MAX} characters.`);
	return text;
}

function idOf(id) {
	if (!UUID.test(id ?? '')) throw notFound();
	return id.toLowerCase();
}

async function list(ctx, request, response) {
	const session = callerSession(request, ctx.config, ctx.verifySession);
	const rows = await guarded(() => ctx.pg.asService().get(`${TABLE}?${scope(ctx, session.userId, { select: COLUMNS, order: 'created_at.asc' })}`));
	if (!Array.isArray(rows)) throw unavailable();
	return sendJson(response, 200, rows.map(present), ctx.config);
}

async function rename(ctx, request, response, rawId) {
	const session = callerSession(request, ctx.config, ctx.verifySession);
	const id = idOf(rawId);
	const nickname = nicknameOf(await readBody(request));
	await writeAudit(ctx.pg, { session, meta: clientMetaOf(request, ctx.config), eventType: 'account.passkey.rename', details: { passkeyId: id } });
	const rows = await guarded(() => ctx.pg.asService().patch(`${TABLE}?${scope(ctx, session.userId, { id: `eq.${id}`, select: COLUMNS })}`, { name: nickname }, { prefer: 'return=representation' }));
	if (!Array.isArray(rows) || rows.length === 0) throw notFound();
	return sendJson(response, 200, present(rows[0]), ctx.config);
}

async function remove(ctx, request, response, rawId) {
	const session = callerSession(request, ctx.config, ctx.verifySession);
	const id = idOf(rawId);
	await writeAudit(ctx.pg, { session, meta: clientMetaOf(request, ctx.config), eventType: 'account.passkey.remove', details: { passkeyId: id } });
	const rows = await guarded(() => ctx.pg.asService().del(`${TABLE}?${scope(ctx, session.userId, { id: `eq.${id}`, select: 'id' })}`, { prefer: 'return=representation' }));
	if (!Array.isArray(rows) || rows.length === 0) throw notFound();
	return sendJson(response, 200, { ok: true }, ctx.config);
}

const HANDLERS = { GET: list, PATCH: rename, DELETE: remove };

export function createPasskeyRoutes({ config, pg, verifySession, env = process.env }) {
	const ctx = { config, pg, verifySession };
	return async function handlePasskeyRequest(url, request, response) {
		const match = PATH.exec(url.pathname);
		const handler = HANDLERS[request.method];
		if (!match || !handler || (request.method === 'GET') !== (match[1] === undefined)) return false;
		try {
			if (env.PASSKEYS_ENABLED !== '1') throw accountError(404, 'passkeys_disabled', 'Passkeys are not enabled on this server.');
			await handler(ctx, request, response, match[1]);
		} catch (error) {
			respondWithError(response, error, config);
		}
		return true;
	};
}
