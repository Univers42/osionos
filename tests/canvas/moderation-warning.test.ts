/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   moderation-warning.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The one thing every client that writes public text asks the same question:
 * is this failure L0's warning (the author is asked first) or an error?
 *
 * `warningFrom` is that answer. It reads the envelope the bridge sends — a 409
 * with `code: 'moderation_warning'` — and returns the warning the author is
 * shown, or null for every other failure.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { warningFrom } from "@/shared/moderation/moderationWarning";

test("a 409 moderation warning is the warning the author is shown", () => {
  const warning = warningFrom({
    status: 409,
    code: "moderation_warning",
    message: "This may hurt someone. Edit it, or post it anyway.",
    details: { reasons: ["blocklist"], terms: ["foul"] },
  });
  assert.ok(warning);
  assert.equal(warning.code, "moderation_warning");
  assert.equal(warning.message, "This may hurt someone. Edit it, or post it anyway.");
  assert.deepEqual(warning.reasons, ["blocklist"]);
  assert.deepEqual(warning.terms, ["foul"]);
});

test("a 409 of another code is not a moderation warning", () => {
  assert.equal(warningFrom({ status: 409, code: "page_conflict", message: "Someone else wrote." }), null);
});

test("a 500 is not a moderation warning", () => {
  assert.equal(warningFrom({ status: 500, code: "API_ERROR", message: "The bridge is down." }), null);
});

test("a warning without details carries empty lists", () => {
  const warning = warningFrom({ status: 409, code: "moderation_warning" });
  assert.ok(warning);
  assert.deepEqual(warning.reasons, []);
  assert.deepEqual(warning.terms, []);
});

test("the warning a bridge error carries is read from its details, not from its message", () => {
  const warning = warningFrom({
    status: 409,
    code: "moderation_warning",
    message: "This may hurt someone. Edit it, or post it anyway.",
    details: { reasons: ["harassment"], terms: ["foul", "ugly"] },
  });
  assert.ok(warning);
  assert.deepEqual(warning.reasons, ["harassment"]);
  assert.deepEqual(warning.terms, ["foul", "ugly"]);
});
