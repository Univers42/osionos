/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   note-compose-utils.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: serjimen <djsurgeon83@gmail.com>           +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/29 17:20:00 by serjimen          #+#    #+#             */
/*   Updated: 2026/09/29 17:20:00 by serjimen         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  extractErrorMessage,
  formatCharacterCount,
  isSubmitShortcut,
  sanitizeNote,
} from "../../src/shared/ui/molecules/NoteComposeModal/noteComposeUtils.ts";

test("isSubmitShortcut detects Cmd+Enter and Ctrl+Enter", () => {
  assert.equal(isSubmitShortcut({ key: "Enter", metaKey: true }), true);
  assert.equal(isSubmitShortcut({ key: "Enter", ctrlKey: true }), true);
  assert.equal(isSubmitShortcut({ key: "Enter", metaKey: true, ctrlKey: true }), true);

  // Plain Enter or Shift+Enter should not trigger submit
  assert.equal(isSubmitShortcut({ key: "Enter" }), false);
  assert.equal(isSubmitShortcut({ key: "Enter", shiftKey: true }), false);
  assert.equal(isSubmitShortcut({ key: "a", metaKey: true }), false);

  // IME composition should not trigger submit
  assert.equal(
    isSubmitShortcut({ key: "Enter", metaKey: true, nativeEvent: { isComposing: true } }),
    false,
  );
});

test("sanitizeNote trims whitespace", () => {
  assert.equal(sanitizeNote("   Hello world!  "), "Hello world!");
  assert.equal(sanitizeNote(""), "");
  assert.equal(sanitizeNote("   \n\t  "), "");
});

test("extractErrorMessage extracts message from Error instances, strings, and falls back", () => {
  assert.equal(
    extractErrorMessage(new Error("Network connection dropped"), "Fallback error"),
    "Network connection dropped",
  );
  assert.equal(
    extractErrorMessage("Explicit error string", "Fallback error"),
    "Explicit error string",
  );
  assert.equal(extractErrorMessage(null, "Fallback error"), "Fallback error");
  assert.equal(extractErrorMessage(undefined, "Fallback error"), "Fallback error");
  assert.equal(extractErrorMessage({}, "Fallback error"), "Fallback error");
  assert.equal(extractErrorMessage(new Error("   "), "Fallback error"), "Fallback error");
});

test("formatCharacterCount formats bounds accurately", () => {
  assert.equal(formatCharacterCount(0, 280), "0/280");
  assert.equal(formatCharacterCount(42, 280), "42/280");
  assert.equal(formatCharacterCount(280, 280), "280/280");
});
