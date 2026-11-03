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
  type SemanticColor,
} from '../../src/shared/colors/semanticColor.ts';

describe('semanticColor', () => {
  it('normalizes canonical, legacy and alias colors via map lookup', () => {
    const expectations: Record<string, SemanticColor> = {
      red: 'red',
      blue: 'blue',
      green: 'green',
      RED: 'red',
      Blue: 'blue',
      '  GREEN  ': 'green',
      'bg-danger-surface-muted text-danger-text-tag': 'red',
      'bg-accent-muted text-accent-text-bold': 'blue',
      'bg-success-surface-muted text-success-text-tag': 'green',
      'bg-warning-surface-muted text-warning-text-tag': 'orange',
      'bg-purple-surface-muted text-purple-text-tag': 'purple',
      'bg-pink-surface-muted text-pink-text-tag': 'pink',
      'bg-cyan-surface-muted text-cyan-text-tag': 'blue',
      'bg-orange-surface-muted text-orange-text-tag': 'orange',
      'bg-surface-muted': 'gray',
      'bg-accent-subtle': 'blue',
      'bg-success-surface-medium': 'green',
      cyan: 'blue',
      amber: 'yellow',
      emerald: 'green',
      violet: 'purple',
    };

    for (const [input, expected] of Object.entries(expectations)) {
      assert.equal(normalizeOptionColor(input), expected, `Failed on ${input}`);
    }

    for (const color of SEMANTIC_COLORS) {
      assert.equal(normalizeOptionColor(color), color);
    }
  });

  it('normalizes blank or unknown input to default', () => {
    const invalidInputs = [undefined, null, '', '   ', 'junk', 'not-a-real-color', 'foobar-123'];
    for (const value of invalidInputs) {
      assert.equal(normalizeOptionColor(value), 'default');
    }
  });

  it('maps semantic color to design system tokens', () => {
    const redTokens = semanticColorToTokens('red');
    assert.equal(redTokens.bg, 'var(--osio-block-tint-red-bg)');
    assert.equal(redTokens.fg, 'var(--osio-block-tint-red-fg)');

    const defaultTokens = semanticColorToTokens('default');
    assert.equal(defaultTokens.bg, 'var(--osio-bg-muted)');
    assert.equal(defaultTokens.fg, 'var(--osio-fg-default)');

    for (const color of SEMANTIC_COLORS) {
      const tokens = semanticColorToTokens(color);
      assert.ok(tokens.bg.startsWith('var(--osio-'));
      assert.ok(tokens.fg.startsWith('var(--osio-'));
    }
  });

  it('validates canonical semantic colors with isSemanticColor guard', () => {
    for (const color of SEMANTIC_COLORS) {
      assert.equal(isSemanticColor(color), true);
    }
    const nonCanonicals = ['cyan', 'amber', 'junk', '', null, undefined, 123, {}];
    for (const item of nonCanonicals) {
      assert.equal(isSemanticColor(item), false);
    }
  });
});
