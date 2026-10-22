/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-share-rules-eval.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The share-rule evaluator, on its own: which rules match a caller, which level they
 * give, and what a malformed rule does. Pure — no store, no bridge, no clock.
 *
 * The vocabulary is the app's own (src/features/share/types.ts): no_access is an
 * EXPLICIT DENY that beats every grant, can_view reads, can_comment reads (and never
 * writes), can_edit writes, full_access writes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	SHARE_LEVELS, bestShareLevel, ruleMatchesCaller, shareDenies, shareGrantsRead, shareGrantsWrite,
} from '../../scripts/bridge-share-rules.mjs';

const PAGE = '11111111-1111-4111-8111-111111111111';
const OTHER_PAGE = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';
const CALLER = '44444444-4444-4444-8444-444444444444';
const OTHER_USER = '55555555-5555-4555-8555-555555555555';
const CTX = { userId: CALLER, role: 'viewer', workspaceId: WS };

/** A stored rule row (the shape public.osionos_share_rules holds). */
function rule(over = {}) {
	return {
		id: '66666666-6666-4666-8666-666666666666',
		workspace_id: WS,
		resource_type: 'page',
		resource_id: PAGE,
		target: { type: 'user', userId: CALLER },
		permission: 'can_view',
		explicit: true,
		...over,
	};
}

describe('the share levels are the app vocabulary, in order', () => {
	it('knows the five levels and their order', () => {
		assert.deepEqual(SHARE_LEVELS, ['no_access', 'can_view', 'can_comment', 'can_edit', 'full_access']);
	});

	it('no_access denies; can_view and can_comment read; can_edit and full_access write', () => {
		assert.equal(shareDenies('no_access'), true);
		assert.equal(shareDenies('can_view'), false);
		assert.equal(shareDenies(null), false);
		assert.equal(shareGrantsRead('can_view'), true);
		assert.equal(shareGrantsRead('can_comment'), true);
		assert.equal(shareGrantsRead('can_edit'), true);
		assert.equal(shareGrantsRead('no_access'), false);
		assert.equal(shareGrantsRead(null), false);
		assert.equal(shareGrantsWrite('can_comment'), false);
		assert.equal(shareGrantsWrite('can_edit'), true);
		assert.equal(shareGrantsWrite('full_access'), true);
		assert.equal(shareGrantsWrite('can_view'), false);
		assert.equal(shareGrantsWrite(null), false);
	});
});

describe('a rule matches the caller it names', () => {
	it('a user target matches that user, case-insensitively', () => {
		assert.equal(ruleMatchesCaller(rule(), CTX), true);
		assert.equal(ruleMatchesCaller(rule({ target: { type: 'user', userId: CALLER.toUpperCase() } }), CTX), true);
		assert.equal(ruleMatchesCaller(rule({ target: { type: 'user', userId: OTHER_USER } }), CTX), false);
	});

	it('a role target matches the caller role', () => {
		assert.equal(ruleMatchesCaller(rule({ target: { type: 'role', role: 'viewer' } }), CTX), true);
		assert.equal(ruleMatchesCaller(rule({ target: { type: 'role', role: 'editor' } }), CTX), false);
	});

	it('a workspace target matches the caller workspace', () => {
		assert.equal(ruleMatchesCaller(rule({ target: { type: 'workspace' } }), CTX), true);
		assert.equal(ruleMatchesCaller(rule({ target: { type: 'workspace' }, workspace_id: OTHER_PAGE }), CTX), false);
	});

	it('a public target matches every caller', () => {
		assert.equal(ruleMatchesCaller(rule({ target: { type: 'public' } }), CTX), true);
		assert.equal(ruleMatchesCaller(rule({ target: { type: 'public' } }), { ...CTX, userId: OTHER_USER }), true);
	});

	it('a rule on another resource type is not a page rule', () => {
		assert.equal(ruleMatchesCaller(rule({ resource_type: 'database' }), CTX), false);
		assert.equal(bestShareLevel([rule({ resource_type: 'database' })], CTX, PAGE), null);
	});
});

describe('the best level is the one the caller keeps', () => {
	it('a rule for another page never counts', () => {
		assert.equal(bestShareLevel([rule({ resource_id: OTHER_PAGE })], CTX, PAGE), null);
	});

	it('the page rule and the workspace-wide rule both count', () => {
		assert.equal(bestShareLevel([rule()], CTX, PAGE), 'can_view');
		assert.equal(bestShareLevel([rule({ resource_id: '' })], CTX, PAGE), 'can_view');
	});

	it('the store maps the workspace-wide rule to a null resource, and that matches too', () => {
		// scripts/bridge-perms-rules.mjs toApiRule: a workspace-wide rule ('') is null in the API shape.
		const apiRule = { _id: 'x', workspaceId: WS, resourceId: null, resourceType: 'page', target: { type: 'user', userId: CALLER }, permission: 'can_view' };
		assert.equal(bestShareLevel([apiRule], CTX, PAGE), 'can_view');
	});

	it('the highest matching level wins', () => {
		const rules = [
			rule({ permission: 'can_view' }),
			rule({ target: { type: 'role', role: 'viewer' }, permission: 'can_edit' }),
		];
		assert.equal(bestShareLevel(rules, CTX, PAGE), 'can_edit');
	});

	it('a no_access rule beats every grant', () => {
		const rules = [
			rule({ target: { type: 'user', userId: CALLER }, permission: 'can_edit' }),
			rule({ target: { type: 'role', role: 'viewer' }, permission: 'no_access' }),
		];
		assert.equal(bestShareLevel(rules, CTX, PAGE), 'no_access');
		assert.equal(shareDenies(bestShareLevel(rules, CTX, PAGE)), true);
	});

	it('a rule for another user grants nothing', () => {
		assert.equal(bestShareLevel([rule({ target: { type: 'user', userId: OTHER_USER }, permission: 'can_edit' })], CTX, PAGE), null);
	});
});

describe('nothing throws, and a malformed rule grants nothing', () => {
	it('empty rules grant nothing', () => {
		assert.equal(bestShareLevel([], CTX, PAGE), null);
		assert.equal(bestShareLevel(null, CTX, PAGE), null);
		assert.equal(bestShareLevel(undefined, CTX, PAGE), null);
	});

	it('a null rule grants nothing', () => {
		assert.equal(bestShareLevel([null, undefined], CTX, PAGE), null);
		assert.equal(ruleMatchesCaller(null, CTX), false);
	});

	it('a malformed rule grants nothing and denies nothing', () => {
		const malformed = [
			rule({ permission: 'owner' }),
			rule({ permission: undefined }),
			rule({ target: { type: 'everyone' } }),
			rule({ target: null }),
			rule({ resource_type: undefined }),
			rule({ resource_id: undefined }),
		];
		for (const candidate of malformed) {
			assert.equal(bestShareLevel([candidate], CTX, PAGE), null, JSON.stringify(candidate));
			assert.equal(shareDenies(bestShareLevel([candidate], CTX, PAGE)), false, JSON.stringify(candidate));
		}
	});

	it('a rule whose target or resource type is broken matches nobody', () => {
		for (const candidate of [rule({ target: { type: 'everyone' } }), rule({ target: null }), rule({ resource_type: undefined })]) {
			assert.equal(ruleMatchesCaller(candidate, CTX), false, JSON.stringify(candidate));
		}
	});

	it('a malformed rule next to a good one does not spoil it', () => {
		const rules = [rule({ permission: 'owner' }), rule({ permission: 'can_edit' })];
		assert.equal(bestShareLevel(rules, CTX, PAGE), 'can_edit');
	});
});
