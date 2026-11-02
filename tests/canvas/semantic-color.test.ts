/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   semantic-color.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/02 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/02 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isSemanticColor,
  normalizeOptionColor,
  SEMANTIC_COLORS,
  semanticColorToTokens,
} from '../../src/shared/colors/semanticColor.ts';

describe('semanticColor', () => {
  describe('canonical colors', () => {
    it('returns each member of SEMANTIC_COLORS as-is', () => {
      for (const color of SEMANTIC_COLORS) {
        assert.equal(normalizeOptionColor(color), color);
      }
    });

    it('handles uppercase canonical colors', () => {
      assert.equal(normalizeOptionColor('RED'), 'red');
      assert.equal(normalizeOptionColor('Blue'), 'blue');
      assert.equal(normalizeOptionColor('  GREEN  '), 'green');
    });
  });

  describe('empty / null / undefined / junk', () => {
    it('returns default for falsy or blank values', () => {
      assert.equal(normalizeOptionColor(undefined), 'default');
      assert.equal(normalizeOptionColor(null), 'default');
      assert.equal(normalizeOptionColor(''), 'default');
      assert.equal(normalizeOptionColor('   '), 'default');
    });

    it('returns default for unrecognized junk strings', () => {
      assert.equal(normalizeOptionColor('junk'), 'default');
      assert.equal(normalizeOptionColor('not-a-real-color'), 'default');
      assert.equal(normalizeOptionColor('foobar-123'), 'default');
    });
  });

  describe('Notion Database TAG_COLORS variants', () => {
    it('normalizes legacy Tailwind tag strings to canonical semantic colors', () => {
      assert.equal(normalizeOptionColor('bg-danger-surface-muted text-danger-text-tag'), 'red');
      assert.equal(normalizeOptionColor('bg-accent-muted text-accent-text-bold'), 'blue');
      assert.equal(normalizeOptionColor('bg-success-surface-muted text-success-text-tag'), 'green');
      assert.equal(normalizeOptionColor('bg-warning-surface-muted text-warning-text-tag'), 'orange');
      assert.equal(normalizeOptionColor('bg-purple-surface-muted text-purple-text-tag'), 'purple');
      assert.equal(normalizeOptionColor('bg-pink-surface-muted text-pink-text-tag'), 'pink');
      assert.equal(normalizeOptionColor('bg-cyan-surface-muted text-cyan-text-tag'), 'blue');
      assert.equal(normalizeOptionColor('bg-orange-surface-muted text-orange-text-tag'), 'orange');
    });
  });

  describe('status editor strings', () => {
    it('normalizes legacy status group strings', () => {
      assert.equal(normalizeOptionColor('bg-surface-muted'), 'gray');
      assert.equal(normalizeOptionColor('bg-accent-subtle'), 'blue');
      assert.equal(normalizeOptionColor('bg-success-surface-medium'), 'green');
    });
  });

  describe('color aliases', () => {
    it('normalizes common color aliases to canonical semantic colors', () => {
      assert.equal(normalizeOptionColor('cyan'), 'blue');
      assert.equal(normalizeOptionColor('amber'), 'yellow');
      assert.equal(normalizeOptionColor('emerald'), 'green');
      assert.equal(normalizeOptionColor('violet'), 'purple');
    });
  });

  describe('semanticColorToTokens', () => {
    it('resolves colored token styles to block-tint CSS variables', () => {
      const redTokens = semanticColorToTokens('red');
      assert.equal(redTokens.bg, 'var(--osio-block-tint-red-bg)');
      assert.equal(redTokens.fg, 'var(--osio-block-tint-red-fg)');

      const blueTokens = semanticColorToTokens('blue');
      assert.equal(blueTokens.bg, 'var(--osio-block-tint-blue-bg)');
      assert.equal(blueTokens.fg, 'var(--osio-block-tint-blue-fg)');
    });

    it('resolves default token styles to standard design system tokens', () => {
      const defaultTokens = semanticColorToTokens('default');
      assert.equal(defaultTokens.bg, 'var(--osio-bg-muted)');
      assert.equal(defaultTokens.fg, 'var(--osio-fg-default)');
    });

    it('resolves all members of SEMANTIC_COLORS without throwing', () => {
      for (const color of SEMANTIC_COLORS) {
        const tokens = semanticColorToTokens(color);
        assert.ok(tokens.bg.startsWith('var(--osio-'));
        assert.ok(tokens.fg.startsWith('var(--osio-'));
      }
    });
  });

  describe('isSemanticColor', () => {
    it('returns true for all valid canonical SemanticColor values', () => {
      for (const color of SEMANTIC_COLORS) {
        assert.equal(isSemanticColor(color), true);
      }
    });

    it('returns false for non-canonical strings and invalid types', () => {
      assert.equal(isSemanticColor('cyan'), false);
      assert.equal(isSemanticColor('amber'), false);
      assert.equal(isSemanticColor('junk'), false);
      assert.equal(isSemanticColor(''), false);
      assert.equal(isSemanticColor(null), false);
      assert.equal(isSemanticColor(undefined), false);
      assert.equal(isSemanticColor(123), false);
      assert.equal(isSemanticColor({}), false);
    });
  });
});
