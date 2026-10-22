/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-access-tokens.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ :+:         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The personal access tokens: what the panel shows, and what it never shows.
 *
 * Three rules, and they are the whole of C112 and C119 here:
 *   - the token is shown ONCE, and the snippet reads it from an environment
 *     variable — never the literal;
 *   - the confirmation of a revoke is INLINE, in the row of the token;
 *   - the panel says plainly what an agent with the token will read.
 *
 * Pure rendering, no JSX of the test itself, no network.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AGENT_COPY,
  PAT_ENV_VAR,
  REAUTH_MESSAGE,
  RevokeControl,
  ShowOnceTokenBox,
  tokenConfigSnippet,
} from "@/features/settings/ai/AccessTokensPanel";

/** A token of the shape the service mints: the prefix and 43 characters. */
const TOKEN = "osn_pat_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";

/** The panel, as the browser would show it. */
const PANEL_SOURCE = readFileSync(
  new URL("../../src/features/settings/ai/AccessTokensPanel.tsx", import.meta.url),
  "utf8",
);

/* -------------------------------------------------------------------------- */
/* The show-once box                                                          */
/* -------------------------------------------------------------------------- */

test("the show-once box shows the token exactly once", () => {
  const markup = renderToStaticMarkup(React.createElement(ShowOnceTokenBox, { token: TOKEN }));
  const occurrences = markup.split(TOKEN).length - 1;
  assert.equal(occurrences, 1, "the token is in the box once, and only there");
  assert.match(markup, /You will not see this token again\./);
});

test("the snippet reads the token from an environment variable, never the literal", () => {
  const snippet = tokenConfigSnippet();
  assert.ok(snippet.includes(PAT_ENV_VAR), "the snippet names the variable");
  assert.equal(snippet.includes(TOKEN), false, "the snippet never holds the token");

  const markup = renderToStaticMarkup(React.createElement(ShowOnceTokenBox, { token: TOKEN }));
  const snippetMarkup = markup.slice(markup.indexOf("export "));
  assert.ok(snippetMarkup.includes(PAT_ENV_VAR), "the box shows the variable");
  assert.equal(snippetMarkup.includes(TOKEN), false, "the box shows no token in the snippet");
});

test("the panel says what an agent with the token will read", () => {
  assert.equal(
    AGENT_COPY,
    "An agent using this token reads text that other members wrote. osionos cannot see or control the agent's other tools.",
  );
  const markup = renderToStaticMarkup(React.createElement(ShowOnceTokenBox, { token: TOKEN }));
  assert.ok(markup.includes("reads text that other members wrote"));
});

test("a session that is too old says so in plain words", () => {
  assert.equal(REAUTH_MESSAGE, "Sign in again to create a token.");
});

/* -------------------------------------------------------------------------- */
/* The revoke, confirmed inline                                               */
/* -------------------------------------------------------------------------- */

test("the revoke asks first, and the question is inline", () => {
  const idle = renderToStaticMarkup(
    React.createElement(RevokeControl, {
      name: "My agent",
      confirming: false,
      busy: false,
      onAsk: () => undefined,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );
  assert.ok(idle.includes("Revoke"), "the button is there");
  assert.equal(idle.includes("Revoke this token?"), false, "no question until it is asked");
  assert.equal(idle.includes("Cancel"), false, "no way out until the question is asked");

  const asking = renderToStaticMarkup(
    React.createElement(RevokeControl, {
      name: "My agent",
      confirming: true,
      busy: false,
      onAsk: () => undefined,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );
  assert.ok(asking.includes("Revoke this token?"), "the question is in the row");
  assert.ok(asking.includes("Cancel"), "the question can be refused");
  assert.ok(asking.includes('aria-label="Revoke My agent"'), "the group is named");
});

test("the panel never asks the browser to confirm", () => {
  assert.equal(/\b(?:window|globalThis)\s*\.\s*confirm\b/.test(PANEL_SOURCE), false);
  assert.equal(/[^.\w]confirm\s*\(/.test(PANEL_SOURCE), false);
});
