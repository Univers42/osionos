/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-create-page-error.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Regression guard for the "can't create a dev page — nothing happens" bug:
// createAddPage used to `return null` on failure with no user feedback, so a
// failed create was indistinguishable from a no-op. The fix routes both failure
// paths through notifyCreateFailure, which must push an error toast (and still
// return null). This unit-tests that helper in isolation — the full
// pageStore.actions graph pulls api/client, whose TS parameter properties the
// canvas strip-types loader cannot parse.

import assert from "node:assert/strict";
import test from "node:test";

import { notifyCreateFailure } from "@/store/pageCreateFeedback";
import { useToastStore } from "@/shared/ui/primitives/useToastStore";

test("notifyCreateFailure: returns null and pushes an error toast (not a silent no-op)", () => {
  useToastStore.getState().clear();

  const result = notifyCreateFailure("You don't have access to this workspace.");

  assert.equal(result, null, "returns null so callers can `return notifyCreateFailure(...)`");
  const toasts = useToastStore.getState().toasts;
  assert.equal(toasts.length, 1, "exactly one toast pushed");
  assert.equal(toasts[0].kind, "error", "toast is an error");
  assert.equal(toasts[0].title, "Couldn't create page", "toast has the create-failure title");
  assert.equal(
    toasts[0].description,
    "You don't have access to this workspace.",
    "toast carries the friendly, internals-free reason",
  );
});

test("notifyCreateFailure: forwards an underlying error for developer logs, still toasts", () => {
  useToastStore.getState().clear();

  const result = notifyCreateFailure("The server rejected the request.", new Error("500"));

  assert.equal(result, null);
  const toasts = useToastStore.getState().toasts;
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, "error");
  assert.equal(toasts[0].description, "The server rejected the request.");
});
