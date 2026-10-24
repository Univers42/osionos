/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   two-step-methods.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * P3-2-c: the preferred two-step method only orders the options the modal offers. The server
 * never reads it, a passkey is never an option, and an unset or unknown value means the
 * authenticator app first.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { METHOD_LABELS, orderedMethods } from "../../src/features/settings/profile/twoStepMethods.ts";

const cases: Array<[string, Parameters<typeof orderedMethods>[0], string[]]> = [
  ["unset", undefined, ["totp", "recovery"]],
  ["totp", "totp", ["totp", "recovery"]],
  ["recovery", "recovery", ["recovery", "totp"]],
];

for (const [label, preferred, expected] of cases) {
  test(`orderedMethods: ${label} preferred`, () => {
    assert.deepEqual(orderedMethods(preferred), expected);
  });
}

test("orderedMethods: offers exactly the labelled methods, never a passkey", () => {
  assert.deepEqual([...orderedMethods("totp")].sort(), Object.keys(METHOD_LABELS).sort());
  assert.ok(!orderedMethods("recovery").some((method) => String(method) === "passkey"));
});
