/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-pat-permissions.test.mjs                    :+:      :+:    :+:   */
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
 * Pure: no server, no fetch, no clock. Two things are pinned here. The vocabulary is compared
 * against the page entry's own shape, so a page field cannot become maskable without someone
 * deciding it should be. The evaluator is deny-by-default: an unknown resource or permission
 * narrows a grant to nothing, an unknown attribute is dropped rather than honoured.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageRowToEntry } from '../../scripts/bridge-api.mjs';
import {
	PAT_PERMISSIONS,
	PAT_RESOURCES,
	evaluatePat,
	isPatGrant,
	isPatScope,
	maskAttributes,
	maskRequestPayload,
} from '../../scripts/bridge-pat-permissions.mjs';

const BRIDGE_API_SOURCE = readFileSync(new URL('../../scripts/bridge-api.mjs', import.meta.url), 'utf8');

/** The body of a named function, brace-matched. */
function functionBody(source, name) {
	const start = source.indexOf(`function ${name}(`);
	assert.notEqual(start, -1, `${name} must exist in scripts/bridge-api.mjs`);
	const open = source.indexOf('{', start);
	let depth = 0;
	for (let index = open; index < source.length; index += 1) {
		if (source[index] === '{') depth += 1;
		else if (source[index] === '}') {
			depth -= 1;
			if (depth === 0) return source.slice(open + 1, index);
		}
	}
	throw new Error(`unbalanced braces in ${name}`);
}

/**
 * The payload keys the page update path reads.
 *
 * pageUpdateRowFromPayload is private to bridge-api.mjs, and that module is not this package's
 * to edit, so the list is read out of its source rather than imported. The two shapes the update
 * path takes are both counted: assignPayloadValue names the payload key explicitly, and
 * templateSurface and updatedAt are read straight off the payload.
 */
function pageUpdatePayloadKeys() {
	const keys = new Set();
	for (const name of ['pageUpdatedAtFromPayload', 'pageUpdateRowFromPayload']) {
		const body = functionBody(BRIDGE_API_SOURCE, name);
		for (const match of body.matchAll(/assignPayloadValue\(\s*row\s*,\s*payload\s*,\s*'([^']+)'/g)) keys.add(match[1]);
		for (const match of body.matchAll(/\bpayload\.([A-Za-z_$][\w$]*)/g)) keys.add(match[1]);
	}
	return keys;
}

/** A page row carrying every column pageRowToEntry reads, content included. */
const FULL_PAGE_ROW = {
	id: '11111111-1111-4111-8111-111111111111',
	title: 'Roadmap',
	icon: 'rocket',
	cover: 'https://cdn.example.test/cover.png',
	cover_position: 42,
	updated_at: '2026-10-22T00:00:00.000Z',
	created_at: '2026-10-01T00:00:00.000Z',
	workspace_id: '22222222-2222-4222-8222-222222222222',
	owner_id: '33333333-3333-4333-8333-333333333333',
	visibility: 'private',
	collaborators: [],
	parent_page_id: null,
	sort_order: 3,
	database_id: null,
	archived_at: null,
	content: [{ id: 'block-1' }],
	properties: [],
	surface: 'page',
	is_template: false,
	is_default_template: false,
	template_surface: 'profile',
	recurrence: null,
};

const READ = { resource: 'pages', permission: 'read' };
const WRITE = { resource: 'pages', permission: 'write' };

test('the vocabulary names exactly the page entry keys, unioned with the keys the update path reads', () => {
	const entryKeys = Object.keys(pageRowToEntry(FULL_PAGE_ROW));
	const expected = new Set([...entryKeys, ...pageUpdatePayloadKeys()]);
	const vocabulary = new Set(PAT_RESOURCES.pages.attributes);
	assert.deepEqual([...vocabulary].sort(), [...expected].sort());
});

test('the vocabulary declares one resource and the two permissions', () => {
	assert.deepEqual(Object.keys(PAT_RESOURCES), ['pages']);
	assert.deepEqual(PAT_PERMISSIONS, ['read', 'write']);
});

test('a classic scope grants the pair with no attribute restriction', () => {
	assert.deepEqual(evaluatePat({ scopes: ['pages:read'], grants: [] }, READ), { allowed: true, mask: null });
});

test('a classic read scope does not grant a write', () => {
	const decision = evaluatePat({ scopes: ['pages:read'], grants: [] }, WRITE);
	assert.equal(decision.allowed, false);
	assert.equal(decision.mask, null);
});

test('a fine-grained grant is restricted to its attributes', () => {
	const decision = evaluatePat({ scopes: [], grants: [{ resource: 'pages', attributes: ['title'], permissions: ['read'] }] }, READ);
	assert.equal(decision.allowed, true);
	assert.deepEqual(decision.mask, ['title']);
});

test('a fine-grained read grant does not grant a write', () => {
	const decision = evaluatePat({ scopes: [], grants: [{ resource: 'pages', attributes: ['title'], permissions: ['read'] }] }, WRITE);
	assert.equal(decision.allowed, false);
	assert.equal(decision.mask, null);
});

test('a grant carrying both permissions allows both and keeps its mask', () => {
	const row = { scopes: [], grants: [{ resource: 'pages', attributes: ['title'], permissions: ['read', 'write'] }] };
	assert.deepEqual(evaluatePat(row, READ), { allowed: true, mask: ['title'] });
	assert.deepEqual(evaluatePat(row, WRITE), { allowed: true, mask: ['title'] });
});

test('two grants for the same resource union their attributes', () => {
	const decision = evaluatePat({
		scopes: [],
		grants: [
			{ resource: 'pages', attributes: ['title'], permissions: ['read'] },
			{ resource: 'pages', attributes: ['icon'], permissions: ['read'] },
		],
	}, READ);
	assert.equal(decision.allowed, true);
	assert.deepEqual([...decision.mask].sort(), ['icon', 'title']);
});

test('a grant for another resource is denied', () => {
	const decision = evaluatePat({ scopes: [], grants: [{ resource: 'nope', attributes: ['title'], permissions: ['read'] }] }, READ);
	assert.equal(decision.allowed, false);
	assert.equal(decision.mask, null);
});

test('a grant naming an unknown permission is denied', () => {
	const decision = evaluatePat({ scopes: [], grants: [{ resource: 'pages', attributes: ['title'], permissions: ['delete'] }] }, READ);
	assert.equal(decision.allowed, false);
	assert.equal(decision.mask, null);
});

test('a grant carrying one unknown permission is ignored entirely', () => {
	const decision = evaluatePat({ scopes: [], grants: [{ resource: 'pages', attributes: ['title'], permissions: ['read', 'delete'] }] }, READ);
	assert.equal(decision.allowed, false);
	assert.equal(decision.mask, null);
});

test('an unknown attribute is dropped from the mask and the grant still holds', () => {
	const decision = evaluatePat({ scopes: [], grants: [{ resource: 'pages', attributes: ['title', 'bogus'], permissions: ['read'] }] }, READ);
	assert.equal(decision.allowed, true);
	assert.deepEqual(decision.mask, ['title']);
});

test('a request naming an unknown permission is denied', () => {
	const decision = evaluatePat({ scopes: ['pages:delete'], grants: [] }, { resource: 'pages', permission: 'delete' });
	assert.equal(decision.allowed, false);
	assert.equal(decision.mask, null);
});

test('a request naming an unknown resource is denied', () => {
	const decision = evaluatePat({ scopes: ['nope:read'], grants: [] }, { resource: 'nope', permission: 'read' });
	assert.equal(decision.allowed, false);
	assert.equal(decision.mask, null);
});

test('empty scopes and empty grants deny', () => {
	assert.equal(evaluatePat({ scopes: [], grants: [] }, READ).allowed, false);
	assert.equal(evaluatePat({ scopes: [], grants: [] }, READ).mask, null);
});

test('a malformed row denies and never throws', () => {
	const rows = [
		{ scopes: 'pages:read', grants: [] },
		{ scopes: [], grants: [null] },
		{ scopes: [], grants: [{}] },
		{ scopes: [], grants: 'pages:read' },
		{ scopes: null, grants: null },
		null,
		undefined,
		'nope',
	];
	for (const row of rows) {
		const decision = evaluatePat(row, READ);
		assert.equal(decision.allowed, false);
		assert.equal(decision.mask, null);
	}
});

test('isPatScope accepts only a known resource:permission pair', () => {
	assert.equal(isPatScope('pages:read'), true);
	assert.equal(isPatScope('pages:write'), true);
	assert.equal(isPatScope('pages:*'), false);
	assert.equal(isPatScope('nope:read'), false);
	assert.equal(isPatScope('pages:delete'), false);
	assert.equal(isPatScope('pages'), false);
	assert.equal(isPatScope('pages:read:extra'), false);
	assert.equal(isPatScope(''), false);
	assert.equal(isPatScope(null), false);
	assert.equal(isPatScope('pages:read '), false);
});

test('isPatGrant accepts a grant naming a known resource, attributes and permissions', () => {
	assert.equal(isPatGrant({ resource: 'pages', attributes: ['title'], permissions: ['read'] }), true);
	assert.equal(isPatGrant({ resource: 'pages', attributes: ['title', 'icon'], permissions: ['read', 'write'] }), true);
});

test('isPatGrant refuses a grant that names anything unknown or leaves a list empty', () => {
	const grants = [
		{ resource: 'pages', attributes: [], permissions: ['read'] },
		{ resource: 'pages', attributes: ['title'], permissions: [] },
		{ resource: 'nope', attributes: ['title'], permissions: ['read'] },
		{ resource: 'pages', attributes: ['bogus'], permissions: ['read'] },
		{ resource: 'pages', attributes: ['title'], permissions: ['delete'] },
		{ resource: 'pages', attributes: 'title', permissions: ['read'] },
		{ resource: 'pages', attributes: ['title'], permissions: 'read' },
		{ attributes: ['title'], permissions: ['read'] },
		null,
		[],
		'pages:read',
	];
	for (const grant of grants) assert.equal(isPatGrant(grant), false);
});

const ENTRY = {
	_id: 'page-1',
	title: 'Roadmap',
	icon: 'rocket',
	ownerId: 'user-1',
	email: 'someone@example.test',
	content: [{ id: 'block-1' }],
};

test('maskAttributes keeps only the mask keys plus the identity', () => {
	const masked = maskAttributes(ENTRY, ['title']);
	assert.deepEqual(Object.keys(masked).sort(), ['_id', 'title']);
	assert.equal(masked.title, 'Roadmap');
	assert.equal(masked._id, 'page-1');
});

test('maskAttributes drops a key the caller never asked for', () => {
	const masked = maskAttributes(ENTRY, ['title']);
	assert.equal('email' in masked, false);
	assert.equal('ownerId' in masked, false);
	assert.equal('icon' in masked, false);
	assert.equal('content' in masked, false);
});

test('a null mask returns the entry unchanged', () => {
	assert.deepEqual(maskAttributes(ENTRY, null), ENTRY);
	assert.deepEqual(maskAttributes(ENTRY, undefined), ENTRY);
});

test('maskAttributes does not mutate its input', () => {
	const source = { ...ENTRY };
	maskAttributes(source, ['title']);
	assert.deepEqual(Object.keys(source).sort(), Object.keys(ENTRY).sort());
	assert.equal(source.email, 'someone@example.test');
	assert.equal(source.content.length, 1);
});

test('maskRequestPayload keeps only the mask keys and adds nothing', () => {
	const payload = { title: 'New title', visibility: 'public', icon: 'rocket' };
	const masked = maskRequestPayload(payload, ['title']);
	assert.deepEqual(masked, { title: 'New title' });
	assert.deepEqual(Object.keys(masked), ['title']);
});

test('maskRequestPayload returns a payload that is not an object unchanged', () => {
	for (const payload of ['nope', 42, null, undefined, ['title']]) {
		assert.equal(maskRequestPayload(payload, ['title']), payload);
	}
});

test('a null mask leaves the request payload alone', () => {
	const payload = { title: 'New title', visibility: 'public' };
	assert.deepEqual(maskRequestPayload(payload, null), payload);
});
