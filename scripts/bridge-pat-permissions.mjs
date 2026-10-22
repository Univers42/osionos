/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-pat-permissions.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The personal access token vocabulary, the grant evaluator and the field mask.
 *
 * A personal access token is either classic — a list of `resource:permission` scopes, granted
 * their resource's whole pinned vocabulary — or fine-grained — a list of grants naming a
 * resource, the attributes it may touch and the permissions it may use. This module is the one
 * place that says what those words mean: the resource vocabulary, the evaluator that turns a
 * stored token into an allow-or-deny plus a mask, and the functions that apply a mask and check
 * a write against one.
 *
 * It is pure: no I/O, no config, no clock, no dependency. The bridge calls it from a request
 * path, the app copies the vocabulary out of it, and a test can pin both without a server.
 *
 * THE ONE FIELD-MASK APPLIER. The ABAC engine already answers a decision with a mask —
 * `{hide, redact}` (scripts/bridge-perms.mjs:31) — but nothing enforced it: the decision was
 * advisory, and the only applier in the tree is the client. A PAT's mask is that same concept
 * made binding. `maskAttributes` and `maskRequestPayload` are the only two functions in the
 * bridge that REMOVE a field from a payload, and `attributesOutsideMask` is the only function
 * that names the fields a write may not touch. The package that enforces the write set asks
 * this module, so a second applier never appears.
 *
 * The vocabulary is pinned on purpose: the attribute list is a constant, not a function of the
 * page row, so a page field added later is readable by NO existing token until someone adds it
 * to the list. A classic token's mask is that whole pinned list, never null: a classic scope
 * says "this resource", and the fields it may read are the fields the vocabulary knows —
 * `futureField` is not one of them, so a classic token cannot read it either.
 * tests/bridge/bridge-pat-permissions.test.mjs compares the list with the page entry's own keys
 * and fails when they drift.
 *
 * Caveat: the pinned list is only as fresh as the test that compares it — a page field added
 * without touching PAT_RESOURCES is not maskable at all, so a token, classic or fine-grained,
 * silently stops reading it.
 * Caveat: a classic scope and a fine-grained grant cannot both reach the evaluator (the table
 * stores one kind or the other), so the case where both match is resolved here in favour of the
 * classic scope, whose mask is the whole vocabulary and therefore wider than the grant
 * intended.
 * Caveat: maskAttributes returns the entry itself when the mask is null, so a caller that
 * mutates the result mutates the row it was handed. A null mask rides only on a DENIED decision:
 * there is nothing to apply, and the caller must not apply one.
 */

export const PAT_PERMISSIONS = ['read', 'write'];

export const PAT_RESOURCES = {
	pages: {
		attributes: [
			'_id',
			'title',
			'icon',
			'cover',
			'coverPosition',
			'updatedAt',
			'workspaceId',
			'ownerId',
			'visibility',
			'collaborators',
			'parentPageId',
			'sortOrder',
			'databaseId',
			'archivedAt',
			'content',
			'properties',
			'surface',
			'isTemplate',
			'isDefaultTemplate',
			'templateSurface',
			'recurrence',
		],
	},
};

function isPlainObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasResource(resource) {
	return typeof resource === 'string' && Object.hasOwn(PAT_RESOURCES, resource);
}

function resourceAttributes(resource) {
	return hasResource(resource) ? PAT_RESOURCES[resource].attributes : [];
}

function isKnownPermission(permission) {
	return typeof permission === 'string' && PAT_PERMISSIONS.includes(permission);
}

/**
 * A scope is `resource:permission`, both halves in the vocabulary. There is no wildcard:
 * `pages:*` names no permission the bridge knows, so it is not a scope.
 */
export function isPatScope(value) {
	if (typeof value !== 'string') return false;
	const parts = value.split(':');
	if (parts.length !== 2) return false;
	return hasResource(parts[0]) && isKnownPermission(parts[1]);
}

/**
 * A grant names a known resource, a non-empty list of known attributes and a non-empty list of
 * known permissions. The route that mints a token refuses anything else, so a grant that fails
 * here never reaches the table.
 */
export function isPatGrant(value) {
	if (!isPlainObject(value)) return false;
	if (!hasResource(value.resource)) return false;
	if (!Array.isArray(value.attributes) || value.attributes.length === 0) return false;
	const attributes = resourceAttributes(value.resource);
	if (!value.attributes.every((attribute) => typeof attribute === 'string' && attributes.includes(attribute))) return false;
	if (!Array.isArray(value.permissions) || value.permissions.length === 0) return false;
	if (!value.permissions.every((permission) => isKnownPermission(permission))) return false;
	return true;
}

/** The attributes a grant contributes to the mask: the known ones, the unknown ones dropped. */
function grantedAttributes(grant, resource) {
	const attributes = resourceAttributes(resource);
	const known = new Set();
	for (const attribute of grant.attributes) {
		if (typeof attribute === 'string' && attributes.includes(attribute)) known.add(attribute);
	}
	return known;
}

/**
 * The decision for one request: a classic scope grants the pair their resource's whole pinned
 * vocabulary — the mask is every attribute of that resource, never null — while a fine-grained
 * grant grants the pair restricted to its attributes. Deny by default: a grant naming an unknown
 * resource or an unknown permission is ignored entirely, an unknown attribute is dropped from
 * the mask rather than honoured, and a malformed row grants nothing without throwing.
 */
export function evaluatePat(row, request) {
	const token = isPlainObject(row) ? row : {};
	const wanted = isPlainObject(request) ? request : {};
	const resource = typeof wanted.resource === 'string' ? wanted.resource : '';
	const permission = typeof wanted.permission === 'string' ? wanted.permission : '';

	// A request for a pair this build does not know is denied before the token is read: a
	// vocabulary that grew in the database but not in the code must not widen a grant.
	if (!hasResource(resource) || !isKnownPermission(permission)) return { allowed: false, mask: null };

	if (Array.isArray(token.scopes) && token.scopes.includes(`${resource}:${permission}`)) {
		// The pinned list, copied: the caller may not edit the vocabulary through the mask.
		return { allowed: true, mask: [...resourceAttributes(resource)] };
	}

	const attributes = new Set();
	let granted = false;
	if (Array.isArray(token.grants)) {
		for (const grant of token.grants) {
			if (!isPlainObject(grant)) continue;
			if (grant.resource !== resource) continue;
			if (!Array.isArray(grant.permissions) || grant.permissions.length === 0) continue;
			// A grant carrying a permission this build does not know is dropped whole: an
			// unknown permission must never ride in on a grant that also names a real one.
			if (!grant.permissions.every((item) => isKnownPermission(item))) continue;
			if (!grant.permissions.includes(permission)) continue;
			if (!Array.isArray(grant.attributes) || grant.attributes.length === 0) continue;
			granted = true;
			for (const attribute of grantedAttributes(grant, resource)) attributes.add(attribute);
		}
	}

	return { allowed: granted, mask: granted ? [...attributes] : null };
}

/**
 * The masked entry: a new object holding only the mask's keys, plus `_id`, which is the
 * resource's identity and survives every mask. The input is never mutated. A null mask rides
 * on a denied decision — there is nothing to apply, so the entry comes back unchanged.
 */
export function maskAttributes(entry, mask) {
	if (!isPlainObject(entry)) return entry;
	if (mask === null || mask === undefined) return entry;
	const masked = {};
	if (Object.hasOwn(entry, '_id')) masked._id = entry._id;
	for (const key of Array.isArray(mask) ? mask : []) {
		if (typeof key !== 'string' || key === '_id') continue;
		if (Object.hasOwn(entry, key)) masked[key] = entry[key];
	}
	return masked;
}

/**
 * The payload's own keys the mask does not cover, sorted. This is the write-set check: a write
 * naming one of these attributes is outside what the token may change, and the caller refuses
 * it (403 pat_forbidden_attribute) rather than filtering it away silently — a silent drop tells
 * the client the field was saved when it was not.
 *
 * A payload that is not a plain object has no keys, so nothing is outside the mask. A mask that
 * is not an array covers nothing, so every key of the payload is outside it.
 */
export function attributesOutsideMask(payload, mask) {
	if (!isPlainObject(payload)) return [];
	const keys = Object.keys(payload);
	if (!Array.isArray(mask)) return keys.sort();
	return keys.filter((key) => !mask.includes(key)).sort();
}

/**
 * The masked request payload: a new object holding only the mask's keys. Nothing is added — a
 * write mask says what the token may change, not what it must send. A payload that is not a
 * plain object comes back unchanged; the route answers 422 on its own.
 */
export function maskRequestPayload(payload, mask) {
	if (!isPlainObject(payload)) return payload;
	if (mask === null || mask === undefined) return payload;
	const masked = {};
	for (const key of Array.isArray(mask) ? mask : []) {
		if (typeof key !== 'string') continue;
		if (Object.hasOwn(payload, key)) masked[key] = payload[key];
	}
	return masked;
}
