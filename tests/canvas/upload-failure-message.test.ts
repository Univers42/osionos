/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   upload-failure-message.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #171: a refused photo said only "Upload failed", so the owner could not tell a cap, a type,
// a dead image store or an ended session apart, and could not act on any of them.

import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "@osionos/http-gate";

import { uploadFailureMessage } from "@/features/settings/profile/uploadFailure";

test("a refusal the bridge explains reaches the owner in its words", () => {
  const refused = new ApiError("The 460px variant is over its 300KB cap.", 422, "avatar_variant_too_large");
  assert.equal(uploadFailureMessage(refused), "The 460px variant is over its 300KB cap.");
});

test("a failing image store says to retry, never the storage internals", () => {
  const message = uploadFailureMessage(new ApiError("Storage upload rejected (500): pq: relation missing", 502));
  assert.match(message, /try again/i);
  assert.doesNotMatch(message, /Storage upload rejected|pq:/);
});

test("a failure in the browser keeps its own reason", () => {
  assert.equal(uploadFailureMessage(new Error("The image is too large even after downscaling.")), "The image is too large even after downscaling.");
});

test("a failure with no reason still says something", () => {
  assert.equal(uploadFailureMessage("nope"), "The image could not be uploaded.");
  assert.equal(uploadFailureMessage(new Error("")), "The image could not be uploaded.");
});
