/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-vigilant-badge.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Vigilant mode: the pure model (key extraction, %G? codes, badge rule) and the Source Control
// view rendered with the flag on, off, and on for a user with no keys.

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  parseSignedLog, showVigilantBadge, signatureState, sshItemsOf, vigilantOf, VIGILANT_LOG_ARGV,
} from "../../src/features/ide/model/ideVigilant.ts";

const { IdeSourceControlView } = await import("../../src/features/ide/ui/IdeSourceControl.tsx");

const BLOB = "AAAAC3NzaC1lZDI1NTE5AAAAIPlaceholderPlaceholderPlaceholder00";

test("signatureState: N unsigned, G signed, every other code unverified", () => {
  const table: Array<[string, string]> = [
    ["N", "unsigned"], ["G", "signed"], ["U", "unverified"], ["E", "unverified"],
    ["B", "unverified"], ["X", "unverified"], ["Y", "unverified"], ["R", "unverified"],
  ];
  for (const [code, state] of table) assert.equal(signatureState(code), state, code);
});

test("parseSignedLog reads code, hash and a subject that may hold tabs", () => {
  const out = "G\tabc1234\tgood one\nN\tdef5678\tplain\nU\t0a0a0a0\ta\tb\n\n";
  assert.deepEqual(parseSignedLog(out), [
    { hash: "abc1234", subject: "good one", state: "signed" },
    { hash: "def5678", subject: "plain", state: "unsigned" },
    { hash: "0a0a0a0", subject: "a\tb", state: "unverified" },
  ]);
});

test("sshItemsOf keeps ssh keys as type and blob and drops the comment and gpg keys", () => {
  const body = { keys: [
    { kind: "ssh", publicKey: `ssh-ed25519 ${BLOB} me@laptop` },
    { kind: "gpg", publicKey: "-----BEGIN PGP PUBLIC KEY BLOCK-----" },
    { kind: "ssh" },
  ] };
  assert.deepEqual(sshItemsOf(body), [{ type: "ssh-ed25519", blob: BLOB }]);
  assert.deepEqual(sshItemsOf(null), []);
  assert.deepEqual(sshItemsOf({ keys: "x" }), []);
});

test("vigilantOf is true only for a literal true", () => {
  assert.equal(vigilantOf({ vigilantMode: true }), true);
  for (const value of [undefined, null, false, "true", 1]) assert.equal(vigilantOf({ vigilantMode: value }), false);
  assert.equal(vigilantOf(null), false);
  assert.equal(vigilantOf({}), false);
});

test("the badge needs the flag, a connected sandbox and at least one key", () => {
  assert.equal(showVigilantBadge(true, true, 1), true);
  assert.equal(showVigilantBadge(false, true, 1), false);
  assert.equal(showVigilantBadge(true, true, 0), false);
  assert.equal(showVigilantBadge(true, null, 1), false);
  assert.equal(showVigilantBadge(true, false, 1), false);
});

test("the vigilant log never rewrites or configures anything", () => {
  assert.deepEqual([...VIGILANT_LOG_ARGV].slice(0, 2), ["git", "log"]);
  assert.ok(!VIGILANT_LOG_ARGV.some((arg) => /config|gpgsign|rebase|commit/.test(arg)));
});

const noop = async () => {};
const gitState = (over: Record<string, unknown> = {}) => ({
  files: [], busy: false, error: null, connected: true, refresh: noop, commit: noop, push: noop,
  vigilant: true, keyCount: 1,
  commits: [
    { hash: "aaa1111", subject: "signed", state: "signed" },
    { hash: "bbb2222", subject: "plain", state: "unsigned" },
    { hash: "ccc3333", subject: "odd", state: "unverified" },
  ],
  ...over,
});
const render = (over?: Record<string, unknown>) =>
  renderToStaticMarkup(React.createElement(IdeSourceControlView, { git: gitState(over) as never }));

test("view: flag on with keys shows the badge and flags only unsigned and unverified commits", () => {
  const html = render();
  assert.match(html, /data-vigilant-badge/);
  assert.match(html, /Vigilant mode/);
  assert.match(html, /data-commit-flag="unsigned"/);
  assert.match(html, /data-commit-flag="unverified"/);
  assert.equal(html.match(/data-commit-flag/g)?.length, 2);
});

test("view: flag off shows no badge and no commit list", () => {
  const html = render({ vigilant: false });
  assert.doesNotMatch(html, /Vigilant mode|data-vigilant-badge|Recent commits/);
});

test("view: a user with no keys sees no badge and no flags", () => {
  const html = render({ keyCount: 0, commits: [] });
  assert.doesNotMatch(html, /Vigilant mode|data-commit-flag/);
});
