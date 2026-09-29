/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   equation-utils.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: serjimen <djsurgeon83@gmail.com>           +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/29 17:47:00 by serjimen          #+#    #+#             */
/*   Updated: 2026/09/29 17:47:00 by serjimen         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  formatEquationAriaLabel,
  sanitizeEquationSource,
} from "../../src/shared/ui/atoms/EquationView/equationUtils.ts";

test("formatEquationAriaLabel formats equation source or appropriate placeholder", () => {
  assert.equal(formatEquationAriaLabel("E = mc^2"), "E = mc^2");
  assert.equal(formatEquationAriaLabel("   \\frac{a}{b}   "), "\\frac{a}{b}");
  assert.equal(formatEquationAriaLabel("", true), "E = mc^2");
  assert.equal(formatEquationAriaLabel("", false), "math equation");
  assert.equal(formatEquationAriaLabel("   ", true), "E = mc^2");
});

test("sanitizeEquationSource trims leading and trailing whitespace while preserving inner syntax", () => {
  assert.equal(sanitizeEquationSource("   \\alpha + \\beta   "), "\\alpha + \\beta");
  assert.equal(sanitizeEquationSource(""), "");
  assert.equal(sanitizeEquationSource("   "), "");
  assert.equal(
    sanitizeEquationSource("\n  \\int_{0}^{\\infty} x dx  \n"),
    "\\int_{0}^{\\infty} x dx",
  );
});
