/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-vision.test.ts                                  :+:      :+:    :+:   */
/*                                                    :+: :+:         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The vision slice, from the side of the reader: the sentences of a failure,
 * the button that attaches an image, and the notice that counts down.
 *
 * Pure logic only: no JSX, no server, no network.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  failureCode,
  noticeText,
  parseRetryAfter,
  retryAfterOf,
  retryDeadline,
  runError,
  secondsLeft,
} from "@/features/chat/model/runErrors";
import { selectionSeesImages } from "@/features/ai/model/aiSelection";
import { AttachImageButton } from "@/widgets/chat-shell/ui/AttachImageButton";
import { RunErrorNotice } from "@/features/chat/model/runErrorNotice";

/* -------------------------------------------------------------------------- */
/* The sentences of a failure                                                 */
/* -------------------------------------------------------------------------- */

/** Every code the service sends. */
const CODES = [
  "rate_limited",
  "budget_exhausted",
  "model_no_vision",
  "vision_unavailable",
  "attachment_not_found",
  "upstream_unavailable",
  "upstream_error",
  "network_error",
  "cancelled",
  "timeout",
  "model_not_allowed",
  "run_in_progress",
  "payload_too_large",
  "invalid_request",
  "not_found",
  "unauthenticated",
  "run_expired",
  "resume_failed",
  "no_stream",
  "endpoint_not_allowed",
  "provider_not_supported",
  "oauth_failed",
  "internal",
];

test("every code of the run has a sentence", () => {
  for (const code of CODES) {
    const info = runError(code);
    assert.equal(info.known, true, `${code} must be a code the table knows`);
    assert.notEqual(info.text, "", `${code} must say something`);
  }
});

test("a code nobody knows is not a sentence of the table", () => {
  const info = runError("no_such_code");
  assert.equal(info.known, false);
  assert.equal(info.retry, false);
});

test("the code of a failure is the service's own", () => {
  assert.equal(failureCode({ code: "rate_limited" }), "rate_limited");
  assert.equal(failureCode({}), "internal");
});

test("the failures of the vision slice have their own sentence", () => {
  assert.equal(runError("model_no_vision").text, "This model cannot see images");
  assert.equal(runError("vision_unavailable").text, "Vision is unavailable for this model");
  assert.equal(runError("attachment_not_found").text, "An attachment could not be found");
});

test("a rate limit says how long to wait", () => {
  const info = runError("rate_limited", { "retry-after": "30" });
  assert.equal(info.retryAfter, 30);
  assert.equal(info.text, "Too many requests — try again in 30 s");
  assert.equal(info.retry, true);
});

test("a rate limit without a header waits a minute", () => {
  const info = runError("rate_limited");
  assert.equal(info.retryAfter, null);
  assert.equal(info.text, "Too many requests — try again in 60 s");
});

test("the Retry-After of a refusal is read from its headers", () => {
  assert.equal(parseRetryAfter(new Headers({ "retry-after": "12" })), 12);
  assert.equal(parseRetryAfter({ "Retry-After": "12" }), 12);
  assert.equal(parseRetryAfter({}), null);
  assert.equal(retryAfterOf({ headers: new Headers({ "retry-after": "12" }) }), 12);
  assert.equal(retryAfterOf({}), null);
});

test("only the failures that may be tried again say so", () => {
  assert.equal(runError("upstream_error").retry, true);
  assert.equal(runError("network_error").retry, true);
  assert.equal(runError("budget_exhausted").retry, false);
  assert.equal(runError("model_no_vision").retry, false);
  assert.equal(runError("vision_unavailable").retry, false);
});

/* -------------------------------------------------------------------------- */
/* Whether the chosen model sees images                                        */
/* -------------------------------------------------------------------------- */

/** The models of two connections, as the service would answer. */
const MODELS_BY_CONNECTION: Record<string, Array<{ id: string; vision?: boolean }>> = {
  platform: [
    { id: "platform-text" },
    { id: "platform-vision", vision: true },
  ],
  "conn-1": [{ id: "conn-1-text" }],
};

test("the model that sees images is the one that says so", () => {
  assert.equal(
    selectionSeesImages({ connectionId: "platform", model: "platform-vision" }, MODELS_BY_CONNECTION),
    true,
  );
});

test("a model that cannot see images never sees one", () => {
  assert.equal(
    selectionSeesImages({ connectionId: "platform", model: "platform-text" }, MODELS_BY_CONNECTION),
    false,
  );
  assert.equal(
    selectionSeesImages({ connectionId: "conn-1", model: "conn-1-text" }, MODELS_BY_CONNECTION),
    false,
  );
});

test("auto is not a model: it sees nothing", () => {
  assert.equal(
    selectionSeesImages({ connectionId: "platform", model: "auto" }, MODELS_BY_CONNECTION),
    false,
  );
});

test("a model that is gone, and a connection without a list, see nothing", () => {
  assert.equal(
    selectionSeesImages({ connectionId: "platform", model: "a-model-that-is-gone" }, MODELS_BY_CONNECTION),
    false,
  );
  assert.equal(
    selectionSeesImages({ connectionId: "conn-without-models", model: "platform-vision" }, MODELS_BY_CONNECTION),
    false,
  );
});

test("a model of another connection does not lend its sight to this one", () => {
  assert.equal(
    selectionSeesImages({ connectionId: "conn-1", model: "platform-vision" }, MODELS_BY_CONNECTION),
    false,
  );
});

/* -------------------------------------------------------------------------- */
/* The button that attaches an image                                         */
/* -------------------------------------------------------------------------- */

test("the attach button is hidden for a model that cannot see images", () => {
  const hidden = renderToStaticMarkup(
    React.createElement(AttachImageButton, { vision: false, attachments: [], onChange: () => {} }),
  );
  assert.doesNotMatch(hidden, /Attach image/);

  // Not knowing yet (the models are still loading) is "cannot see": the button
  // never shows before the picker has said so.
  const unknown = renderToStaticMarkup(
    React.createElement(AttachImageButton, { attachments: [], onChange: () => {} }),
  );
  assert.doesNotMatch(unknown, /Attach image/);

  const shown = renderToStaticMarkup(
    React.createElement(AttachImageButton, { vision: true, attachments: [], onChange: () => {} }),
  );
  assert.match(shown, /aria-label="Attach image"/);
});

test("the picker offers only the formats the service reads", () => {
  const shown = renderToStaticMarkup(
    React.createElement(AttachImageButton, { vision: true, attachments: [], onChange: () => {} }),
  );
  assert.match(shown, /accept="image\/png,image\/jpeg,image\/webp"/);
});

/* -------------------------------------------------------------------------- */
/* The notice of a rate limit                                                 */
/* -------------------------------------------------------------------------- */

/** The clock of the notice: a fixed moment, so the test is not a race. */
const START = 1_700_000_000_000;

test("a rate limit counts down, and offers the retry when the wait is over", () => {
  const info = runError("rate_limited", { "retry-after": "30" });
  const deadline = retryDeadline(info.retryAfter, START);
  assert.equal(secondsLeft(deadline, START), 30);
  assert.equal(secondsLeft(deadline, START + 29_000), 1);
  assert.equal(secondsLeft(deadline, START + 30_000), 0);

  const counting = renderToStaticMarkup(
    React.createElement(RunErrorNotice, {
      code: "rate_limited",
      retryAfter: 30,
      since: START,
      now: START,
      onRetry: () => {},
    }),
  );
  assert.match(counting, /try again in 30 s/);
  assert.doesNotMatch(counting, /run-error-retry/);

  const over = renderToStaticMarkup(
    React.createElement(RunErrorNotice, {
      code: "rate_limited",
      retryAfter: 30,
      since: START,
      now: START + 30_000,
      onRetry: () => {},
    }),
  );
  assert.match(over, /Too many requests — try again/);
  assert.match(over, /run-error-retry/);
  assert.match(over, /Retry/);
});

test("a failure that may be tried again offers its retry at once", () => {
  const html = renderToStaticMarkup(
    React.createElement(RunErrorNotice, { code: "upstream_error", onRetry: () => {} }),
  );
  assert.match(html, /The AI service failed/);
  assert.match(html, /run-error-retry/);
});

test("a failure that may not be tried again offers no retry", () => {
  const html = renderToStaticMarkup(
    React.createElement(RunErrorNotice, { code: "model_no_vision", onRetry: () => {} }),
  );
  assert.match(html, /This model cannot see images/);
  assert.doesNotMatch(html, /run-error-retry/);
});

test("the sentence of the notice carries the seconds that are left", () => {
  const info = runError("rate_limited", { "retry-after": "30" });
  assert.equal(noticeText(info, 30), "Too many requests — try again in 30 s");
  assert.equal(noticeText(info, 1), "Too many requests — try again in 1 s");
  assert.equal(noticeText(info, 0), "Too many requests — try again");
});
