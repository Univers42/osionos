/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-config-budget.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The config sent to the server never carries the page's version snapshots: they are
// local-only (devil 2026-10-28), and they were the bulk of the saves the WAF refused
// (119/215 on 2026-10-27). Translation content is still shed, but only past the
// bridge's own body limit.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shrinkConfigForApi } from '@/shared/config/pageConfigBudget';
import type { PageConfig, PageTranslation, PageVersion } from '@/shared/config/pageConfigStore';

function paragraphs(count: number, text = 'line') {
  return Array.from({ length: count }, (_, i) => ({ id: `b${i}`, type: 'paragraph', content: `${text} ${i}` }));
}

function version(id: string, blocks: number): PageVersion {
  return { id, userId: 'u1', pageId: 'p1', title: id, content: paragraphs(blocks) as PageVersion['content'], createdAt: '2026-10-27T00:00:00Z', label: id };
}

function translation(id: string, blocks: ReturnType<typeof paragraphs>): PageTranslation {
  return { id, userId: 'u1', pageId: 'p1', locale: 'en-US', label: id, title: id, content: blocks as PageTranslation['content'], createdAt: '2026-10-27T00:00:00Z' };
}

function config(overrides: { versions?: PageVersion[]; translations?: PageTranslation[]; activeTranslation?: PageConfig['activeTranslation'] } = {}): PageConfig {
  return {
    font: 'serif', smallText: true, fullWidth: false, locked: false,
    versions: overrides.versions ?? [],
    translations: overrides.translations ?? [],
    activeTranslation: overrides.activeTranslation ?? null,
  } as unknown as PageConfig;
}

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

const three = Array.from({ length: 3 }, (_, i) => version(`v${3 - i}`, 40));
const ten = Array.from({ length: 10 }, (_, i) => version(`v${10 - i}`, 40));
const active = { id: 'en', locale: 'en-US', label: 'English' };

test('the sent config has no versions key, whatever the local version list', () => {
  for (const versions of [[], three, ten]) {
    const sent = shrinkConfigForApi(config({ versions }));
    assert.equal(Object.hasOwn(sent, 'versions'), false, `${versions.length} local versions`);
  }
});

test('every other key is sent deep-equal to the input', () => {
  const input = config({
    versions: ten,
    translations: [translation('en', paragraphs(2, 'active text')), translation('fr', paragraphs(2, 'autre texte'))],
    activeTranslation: active,
  });
  const sent = shrinkConfigForApi(input);
  for (const [key, value] of Object.entries(input)) {
    if (key === 'versions') continue;
    assert.deepEqual((sent as unknown as Record<string, unknown>)[key], value, `${key} changed`);
  }
});

test('the input config is not mutated: its versions are still there after the call', () => {
  const input = config({ versions: ten, translations: [translation('en', paragraphs(2))] });
  shrinkConfigForApi(input);
  assert.deepEqual(input.versions, ten);
  assert.equal(input.versions.length, 10);
});

test('past the bridge limit, inactive translations are emptied and the active one kept whole', () => {
  const input = config({
    versions: ten,
    translations: [translation('en', paragraphs(2, 'active text')), translation('fr', paragraphs(1, 'x'.repeat(6_000_000)))],
    activeTranslation: active,
  });
  const sent = shrinkConfigForApi(input);
  assert.deepEqual(sent.translations[0].content, input.translations[0].content, 'the active translation is sent whole');
  assert.deepEqual(sent.translations[1].content, [], 'the inactive translation is emptied');
});

test('past the bridge limit with a huge active translation, every translation is emptied', () => {
  const input = config({ translations: [translation('en', paragraphs(1, 'x'.repeat(6_000_000)))], activeTranslation: active });
  const sent = shrinkConfigForApi(input);
  assert.deepEqual(sent.translations[0].content, [], 'the active translation is emptied too');
});

test('L5: the ten-version save sends a config body under 2 KiB', () => {
  const input = config({ versions: ten });
  const sent = shrinkConfigForApi(input);
  const before = bytes(input);
  const after = bytes(sent);
  console.log(`L5 bytes before=${before} after=${after}`);
  assert.ok(after < 2048, `sent ${after} bytes`);
});
