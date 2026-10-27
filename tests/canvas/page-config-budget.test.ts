/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-config-budget.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The config sent to the server fits the WAF's 1000-argument edge by dropping whole, oldest
// versions — never by emptying one, which would restore as a blank page.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { jsonLeafCount, shrinkConfigForApi } from '@/shared/config/pageConfigBudget';
import type { PageConfig, PageVersion } from '@/shared/config/pageConfigStore';

function paragraphs(count: number, text = 'line') {
  return Array.from({ length: count }, (_, i) => ({ id: `b${i}`, type: 'paragraph', content: `${text} ${i}` }));
}

function version(id: string, blocks: number): PageVersion {
  return { id, userId: 'u1', pageId: 'p1', title: id, content: paragraphs(blocks) as PageVersion['content'], createdAt: '2026-10-27T00:00:00Z', label: id };
}

function config(versions: PageVersion[]): PageConfig {
  return {
    font: 'default', smallText: false, fullWidth: false, locked: false,
    versions, translations: [], activeTranslation: null,
  } as unknown as PageConfig;
}

test('jsonLeafCount counts scalars and empty containers, and stops at the limit', () => {
  assert.equal(jsonLeafCount({ a: 1, b: [true, null, 'x'], c: {}, d: [] }), 6);
  assert.equal(jsonLeafCount(paragraphs(1000), 50), 50);
});

test('a config under the edge is sent untouched', () => {
  const small = config([version('v2', 3), version('v1', 3)]);
  assert.equal(shrinkConfigForApi(small), small);
});

test('an over-edge config loses its oldest versions whole until it fits', () => {
  // Ten 40-block versions: about 1200 leaves of snapshots, the shape the WAF refused live.
  const versions = Array.from({ length: 10 }, (_, i) => version(`v${10 - i}`, 40));
  const sent = shrinkConfigForApi(config(versions));
  assert.ok(sent.versions.length > 0 && sent.versions.length < 10);
  assert.deepEqual(sent.versions, versions.slice(0, sent.versions.length), 'newest kept, in order, unchanged');
  assert.ok(jsonLeafCount(sent) < 900);
  assert.ok(new TextEncoder().encode(JSON.stringify(sent)).length <= 120_000);
});

test('a version is never sent with emptied content', () => {
  const sent = shrinkConfigForApi(config([version('big', 2000)]));
  assert.deepEqual(sent.versions, []);
});
