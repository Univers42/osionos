/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-roles.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The platform role vocabulary and the read that resolves it.
 *
 * The roles are grobase's own catalogue (`public.roles`, `public.user_roles`), read through
 * the service role: the account role's row-level security is `user_id = osionos_account_uid()`,
 * so an admin reading another user's roles needs the service role (ADR 0001).
 *
 * The read is best-effort and fails closed. A broken read, a missing table or an unknown role
 * name answers no role — never a throw, never a guess. The sign-in mints its claim from it,
 * and every admin route re-reads it at call time, so the claim is a hint, never the authority.
 *
 * Caveat: the role is read when the session is minted and again on every admin request, so a
 * grant that expires takes effect on the next admin request, not inside one that is running.
 */

export const PLATFORM_ROLES = ['admin', 'moderator', 'user', 'guest'];
export const ROLE_RANK = { admin: 3, moderator: 2, user: 1, guest: 0 };

const NO_ROLE = { role: null, names: [] };

// Same shape as bridge-api's subject validator: a role is read for one caller, so the
// subject must name exactly one account. Anything else is no role, not a query.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A role read that never answers must not hold a sign-in open forever: it degrades to no role.
// Caveat: a read that is slow but alive (> 2 s) also degrades, so an admin signs in with no
// role until the next token mint; raise timeoutMs if PostgREST is slow under load.
const ROLE_READ_TIMEOUT_MS = 2000;

/** True when the value is one of the four names the platform knows. */
export function isPlatformRole(value) {
	return typeof value === 'string' && Object.hasOwn(ROLE_RANK, value);
}

/**
 * True when `role` outranks (or is) `min`. An unknown role — and no role at all — is never
 * at least anything: a caller that cannot name a role must not be let in.
 */
export function roleAtLeast(role, min) {
	if (!isPlatformRole(role) || !isPlatformRole(min)) return false;
	return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** The highest-ranked name of the list, null for an empty list or an unknown name. */
export function roleFromNames(names) {
	let best = null;
	for (const name of Array.isArray(names) ? names : []) {
		if (!isPlatformRole(name)) continue;
		if (best === null || ROLE_RANK[name] > ROLE_RANK[best]) best = name;
	}
	return best;
}

/**
 * The role the claim carries: the named role, or 'admin' for the identity flag that
 * OSIONOS_ADMIN_EMAILS sets. The flag is the root of trust (ADR 0005) — it names the admin
 * role ahead of any role row, so the platform always has a way in and no seed step is needed.
 */
export function claimPlatformRole(platformRole, isAdmin = false) {
	if (isAdmin === true) return 'admin';
	return isPlatformRole(platformRole) ? platformRole : null;
}

/**
 * The service reader the role read needs, or null when this bridge cannot read the
 * catalogue. A missing service key is no role rather than a crash: the answer is the same
 * as a user without a grant, and the sign-in still signs them in.
 */
export function platformRoleReader(pg) {
	if (!pg || typeof pg.asService !== 'function') return null;
	try {
		return pg.asService();
	} catch {
		return null;
	}
}

function grantQuery(userId, now) {
	const params = new URLSearchParams({ user_id: `eq.${userId}`, select: 'role_id' });
	// An expired grant is no grant: the filter keeps the row that never expires and the ones
	// that outlive the moment the read happens.
	params.set('or', `(expires_at.is.null,expires_at.gt.${new Date(now).toISOString()})`);
	return `user_roles?${params.toString()}`;
}

/**
 * The platform role of one user: the grants of that user, then the catalogue those grants
 * name. Two reads, because `public.user_roles` carries the role id and `public.roles` the
 * name — the bridge never invents a name.
 *
 * `client` is a PostgREST reader with a `get(path)` (the account plane's `asService()`).
 * Anything that goes wrong answers no role instead of throwing: the caller decides what a
 * missing role means, and it must never be an exception in the middle of a sign-in.
 */
export async function readPlatformRole(client, userId, now = Date.now(), timeoutMs = ROLE_READ_TIMEOUT_MS) {
	if (!client || typeof client.get !== 'function') return { ...NO_ROLE };
	const user = String(userId ?? '').trim();
	if (!user) return { ...NO_ROLE };
	// The subject names one row; a non-UUID never reaches the query builder, so it cannot be
	// turned into a filter or an injection. (C3)
	if (!UUID_REGEX.test(user)) return { ...NO_ROLE };

	const withTimeout = (promise) => {
		let timer;
		const timeout = new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error('role read timed out')), timeoutMs);
		});
		return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
	};

	let grants;
	try {
		grants = await withTimeout(client.get(grantQuery(user, now)));
	} catch {
		console.warn(`[osionos-bridge] readPlatformRole: reading user_roles grants failed for ${user}`);
		return { ...NO_ROLE };
	}
	const roleIds = [...new Set((Array.isArray(grants) ? grants : [])
		.map((row) => String(row?.role_id ?? '').trim())
		.filter(Boolean))]
		.map((roleId) => encodeURIComponent(roleId));
	if (roleIds.length === 0) return { ...NO_ROLE };

	let catalogue;
	try {
		// The ids travel unquoted, like every other id list the bridge sends.
		catalogue = await withTimeout(client.get(`roles?id=in.(${roleIds.join(',')})&select=id,name`));
	} catch {
		console.warn(`[osionos-bridge] readPlatformRole: reading roles catalogue failed for ${user}`);
		return { ...NO_ROLE };
	}
	const names = (Array.isArray(catalogue) ? catalogue : [])
		.map((row) => String(row?.name ?? '').trim().toLowerCase())
		.filter(isPlatformRole);
	return { role: roleFromNames(names), names };
}
