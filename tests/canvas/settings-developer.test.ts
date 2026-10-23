/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-developer.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Developer panel's pure half: the registry entry, the model helpers, the
// tolerant parsers and the static guards that keep a created secret in the
// create dialog's state and nowhere else.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { findSection, searchSettings } from "@/features/settings/model/sections";
import { parseCreated, parseTokenList } from "@/features/settings/developer/patApi";
import {
  attributesOf,
  classicScopes,
  createTokenBody,
  expiryFromDays,
  expiryLabel,
  isExpiryValid,
  kindLabel,
  maxExpiryDate,
  patErrorMessage,
  permissionSummary,
  scopeLabel,
  type PatCatalog,
  type TokenForm,
} from "@/features/settings/developer/patModel";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-23T12:00:00Z");
const UUID = "11111111-2222-4333-8444-555555555555";
const CATALOG: PatCatalog = { resources: { pages: { attributes: ["_id", "title", "content"] } }, permissions: ["read", "write"] };

const classicForm: TokenForm = {
  name: "  CI  ", kind: "classic", expiry: "2026-11-22", scopes: ["pages:read"], resource: "pages", attributes: [], permissions: [],
};

test("the registry has the developer section with its anchor, and 'token' finds it", () => {
  const section = findSection("developer");
  assert.equal(section?.group, "features");
  assert.ok(section?.anchors.some((anchor) => anchor.id === "personal-access-tokens"));
  assert.ok(searchSettings("token").some((hit) => hit.section.id === "developer" && hit.anchor.id === "personal-access-tokens"));
});

test("labels: the scope, the kind (each kind its own) and the expiry", () => {
  assert.equal(scopeLabel("pages:read"), "Pages: read");
  assert.equal(kindLabel("classic"), "Classic");
  assert.equal(kindLabel("fine_grained"), "Fine-grained");
  assert.notEqual(kindLabel("classic"), kindLabel("fine_grained"));
  assert.equal(expiryLabel("2026-10-01T00:00:00Z", NOW), "Expired");
  assert.equal(expiryLabel("2026-10-30T12:00:00Z", NOW), "In 7 days");
  assert.equal(expiryLabel(null, NOW), "No expiry");
});

test("an empty, past, malformed or over-cap expiry is invalid; a day in range is valid", () => {
  for (const bad of ["", "   ", "nope", "2026-10-23", "2026-10-01", "2027-12-31", "2026-02-31"]) {
    assert.equal(isExpiryValid(bad, NOW), false, `${JSON.stringify(bad)} must be refused`);
  }
  assert.equal(isExpiryValid("2026-10-24", NOW), true);
  assert.equal(isExpiryValid(maxExpiryDate(NOW), NOW), true);
  assert.equal(isExpiryValid(expiryFromDays(30, NOW), NOW), true);
  assert.equal(expiryFromDays(7, NOW), "2026-10-30");
});

test("createTokenBody is null for a form that is not ready", () => {
  assert.equal(createTokenBody({ ...classicForm, name: "   " }, NOW), null);
  assert.equal(createTokenBody({ ...classicForm, name: "x".repeat(65) }, NOW), null);
  assert.equal(createTokenBody({ ...classicForm, expiry: "" }, NOW), null);
  assert.equal(createTokenBody({ ...classicForm, scopes: [] }, NOW), null);
  const fine: TokenForm = { ...classicForm, kind: "fine_grained", scopes: [], attributes: ["title"], permissions: ["read"] };
  assert.equal(createTokenBody({ ...fine, attributes: [] }, NOW), null);
  assert.equal(createTokenBody({ ...fine, permissions: [] }, NOW), null);
  assert.equal(createTokenBody({ ...fine, expiry: "" }, NOW), null);
});

test("createTokenBody carries exactly the keys the bridge accepts", () => {
  assert.deepEqual(createTokenBody(classicForm, NOW), {
    name: "CI", kind: "classic", expiresAt: "2026-11-22T00:00:00.000Z", scopes: ["pages:read"],
  });
  const fine: TokenForm = { ...classicForm, kind: "fine_grained", scopes: ["pages:read"], attributes: ["title"], permissions: ["read"] };
  assert.deepEqual(createTokenBody(fine, NOW), {
    name: "CI", kind: "fine_grained", expiresAt: "2026-11-22T00:00:00.000Z",
    grants: [{ resource: "pages", attributes: ["title"], permissions: ["read"] }],
  });
});

test("the picker is the served catalog, never a second list", () => {
  assert.deepEqual(classicScopes(CATALOG), ["pages:read", "pages:write"]);
  assert.deepEqual(attributesOf(CATALOG, "pages"), ["_id", "title", "content"]);
  assert.deepEqual(attributesOf(CATALOG, "nope"), []);
});

test("permissionSummary names the scopes or the grants of a token", () => {
  const base = { id: UUID, name: "n", createdAt: null, expiresAt: null, revokedAt: null };
  assert.equal(permissionSummary({ ...base, kind: "classic", scopes: ["pages:read"], grants: [] }), "Pages: read");
  assert.equal(
    permissionSummary({ ...base, kind: "fine_grained", scopes: [], grants: [{ resource: "pages", attributes: ["title", "icon"], permissions: ["read"] }] }),
    "Pages (title, icon): read",
  );
});

test("every bridge error code has its own friendly copy; an unknown one keeps the bridge's message", () => {
  for (const code of ["pat_expiry_required", "pat_limit_reached", "sudo_required", "rate_limited", "pat_not_found", "account_plane_unavailable", "pat_invalid_body", "pat_unknown_scope"]) {
    assert.notEqual(patErrorMessage(code, "raw"), "raw", `${code} has no friendly copy`);
  }
  assert.equal(patErrorMessage("something_else", "raw"), "raw");
  assert.equal(patErrorMessage(undefined, ""), "That did not go through. Try again.");
});

test("parseTokenList never throws on a malformed body and drops rows without a uuid", () => {
  for (const body of [null, undefined, "x", 3, [], {}, { tokens: "no" }, { tokens: [null, 1, {}, { id: "nope" }] }]) {
    const out = parseTokenList(body);
    assert.deepEqual(out.tokens, []);
  }
  const out = parseTokenList({
    tokens: [{ id: UUID, name: "a", kind: "classic", scopes: ["pages:read"], grants: [], createdAt: "c", expiresAt: "e", revokedAt: null, token_hash: "h" }],
    catalog: CATALOG,
  });
  assert.equal(out.tokens.length, 1);
  assert.deepEqual(Object.keys(out.tokens[0]).sort(), ["createdAt", "expiresAt", "grants", "id", "kind", "name", "revokedAt", "scopes"]);
  assert.deepEqual(out.catalog, CATALOG);
  assert.deepEqual(parseTokenList({ tokens: [], catalog: 4 }).catalog, { resources: {}, permissions: [] });
});

test("parseCreated refuses an answer with no secret instead of a silent success", () => {
  const token = { id: UUID, name: "a", kind: "classic", scopes: ["pages:read"], grants: [] };
  assert.throws(() => parseCreated({ ok: true, token }), /secret was not returned/);
  assert.throws(() => parseCreated(null), /secret was not returned/);
  assert.throws(() => parseCreated({ token, secret: 4 }), /secret was not returned/);
  assert.equal(parseCreated({ token, secret: "osio_pat_x" }).secret, "osio_pat_x");
});

test("the secret lives in the create dialog's state only: no storage, no store, no log, no module state", () => {
  for (const file of ["DeveloperPanel", "CreateTokenModal", "patApi", "patModel"]) {
    const source = read(`src/features/settings/developer/${file}.${file === "patApi" || file === "patModel" ? "ts" : "tsx"}`);
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|zustand|useUserStore|__playgroundUserStore|history\.(push|replace)State|location\./, `${file} stores or exposes state`);
    assert.doesNotMatch(source, /console\.|window\.confirm|confirm\(/, `${file} logs or uses a native confirm`);
    assert.doesNotMatch(source, /^let /m, `${file} holds module-level state`);
  }
  assert.match(read("src/features/settings/developer/CreateTokenModal.tsx"), /useState<string \| null>\(null\)/);
});

test("revoking goes through the in-app confirm: the row button only asks", () => {
  const source = read("src/features/settings/developer/DeveloperPanel.tsx");
  assert.match(source, /<ConfirmModal[\s\S]*?onConfirm=\{[^}]*revokeToken\(/);
  assert.doesNotMatch(source, /onClick=\{[^}]*revokeToken\(/);
  assert.match(source, /Revoke \$\{[^}]*\}\? Apps using it will stop working immediately\./);
});

test("expiry is required by the form itself: the dialog disables Create until the body is ready", () => {
  assert.match(read("src/features/settings/developer/CreateTokenModal.tsx"), /createTokenBody\(form\)/);
});
