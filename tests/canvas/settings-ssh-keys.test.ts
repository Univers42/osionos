/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settings-ssh-keys.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The SSH and GPG keys section: the tolerant parsers, the client-side refusal of a pasted
// private key, the friendly error copy and the static guards (a pasted key never reaches
// storage or a log, delete asks first).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { findSection, searchSettings } from "@/features/settings/model/sections";
import { addKeyBody, keyErrorMessage, looksPrivate, parseKeyCreated, parseKeyList } from "@/features/settings/developer/keysApi";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const UUID = "11111111-2222-4333-8444-555555555555";
const PUBLIC = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl laptop";
const row = { id: UUID, kind: "ssh", title: "Laptop", fingerprint: "SHA256:abc", keyType: "ssh-ed25519", createdAt: "2026-10-01T10:00:00.000Z", publicKey: PUBLIC };

test("the registry has the ssh-gpg-keys anchor under developer and 'ssh' finds it", () => {
  assert.ok(findSection("developer")?.anchors.some((anchor) => anchor.id === "ssh-gpg-keys"));
  assert.ok(searchSettings("ssh").some((hit) => hit.section.id === "developer" && hit.anchor.id === "ssh-gpg-keys"));
  assert.ok(searchSettings("fingerprint").some((hit) => hit.anchor.id === "ssh-gpg-keys"));
});

test("parseKeyList keeps the contract fields, drops a row without a uuid, and never throws", () => {
  assert.deepEqual(parseKeyList({ keys: [row, { ...row, id: "nope" }, null, 4] }).map((key) => key.id), [UUID]);
  assert.equal(parseKeyList({ keys: [{ ...row, kind: "rsa" }] }).length, 0);
  for (const bad of [null, undefined, "x", [], { keys: "x" }]) assert.deepEqual(parseKeyList(bad), []);
  const [key] = parseKeyList({ keys: [{ ...row, extra: "x", user_id: "u" }] });
  assert.deepEqual(Object.keys(key).sort(), ["createdAt", "fingerprint", "id", "keyType", "kind", "title"]);
});

test("parseKeyCreated reads {key}, and says out loud when the key is missing", () => {
  assert.equal(parseKeyCreated({ ok: true, key: row }).fingerprint, "SHA256:abc");
  assert.throws(() => parseKeyCreated({ ok: true }), /not confirm/);
  assert.throws(() => parseKeyCreated(null), /not confirm/);
});

test("looksPrivate refuses private markers only", () => {
  for (const text of ["-----BEGIN OPENSSH PRIVATE KEY-----\nabc", "-----BEGIN RSA PRIVATE KEY-----", "-----BEGIN PGP PRIVATE KEY BLOCK-----", "openssh-key-v1\0abc"]) {
    assert.equal(looksPrivate(text), true, text);
  }
  assert.equal(looksPrivate(PUBLIC), false);
  assert.equal(looksPrivate("-----BEGIN PGP PUBLIC KEY BLOCK-----\n"), false);
});

test("addKeyBody trims, and refuses an empty title, an empty key or a private paste", () => {
  assert.deepEqual(addKeyBody("ssh", "  Laptop ", `\n${PUBLIC}\n `), { kind: "ssh", title: "Laptop", publicKey: PUBLIC });
  assert.equal(addKeyBody("ssh", "", PUBLIC), null);
  assert.equal(addKeyBody("gpg", "x", "   "), null);
  assert.equal(addKeyBody("ssh", "x", "-----BEGIN OPENSSH PRIVATE KEY-----"), null);
});

test("every code the bridge answers has copy a person can act on, and unknown codes keep the bridge's words", () => {
  for (const code of ["key_invalid", "key_weak", "key_unsupported", "private_key_refused", "key_exists", "key_limit", "key_not_found", "invalid_key_body", "sudo_required", "rate_limited", "account_plane_unavailable"]) {
    assert.notEqual(keyErrorMessage(code, "raw"), "raw", code);
  }
  assert.match(keyErrorMessage("private_key_refused", ""), /public key/i);
  assert.equal(keyErrorMessage("weird", " from the bridge "), "from the bridge");
  assert.match(keyErrorMessage(undefined, ""), /try again/i);
});

test("a pasted key lives in the add dialog's state only: no storage, no log, no store", () => {
  for (const file of ["keysApi.ts", "KeysSection.tsx", "AddKeyModal.tsx"]) {
    const source = read(`src/features/settings/developer/${file}`);
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|zustand|__playgroundUserStore|console\.|window\.confirm|confirm\(/, `${file} stores or logs`);
    assert.doesNotMatch(source, /^let /m, `${file} holds module-level state`);
  }
});

test("delete goes through the in-app confirm and the panel only renders the section", () => {
  const section = read("src/features/settings/developer/KeysSection.tsx");
  assert.match(section, /<ConfirmModal[\s\S]*?onConfirm=\{[^}]*removeKey\(/);
  assert.match(section, /async function removeKey[\s\S]*?await deleteKey\(/);
  assert.doesNotMatch(section, /onClick=\{[^}]*(deleteKey|removeKey)\(/);
  assert.match(read("src/features/settings/developer/DeveloperPanel.tsx"), /<KeysSection \/>/);
});
