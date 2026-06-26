/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   e2e-crypto.test.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateKeyPair, exportPublicKey, deriveConversationKey,
  encryptMessage, decryptMessage, isEncrypted, dmSalt,
} from "../../src/shared/chat/e2e/crypto.ts";

describe("e2e crypto", () => {
  it("round-trips a message between two peers (symmetric ECDH key)", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const salt = dmSalt("user-b", "user-a");
    const aKey = await deriveConversationKey(a.privateKey, await exportPublicKey(b.publicKey), salt);
    const bKey = await deriveConversationKey(b.privateKey, await exportPublicKey(a.publicKey), salt);
    const envelope = await encryptMessage(aKey, "secret hello 🔒");
    assert.equal(isEncrypted(envelope), true);
    assert.equal(await decryptMessage(bKey, envelope), "secret hello 🔒");
  });

  it("uses a fresh IV (same plaintext → different ciphertext)", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const key = await deriveConversationKey(a.privateKey, await exportPublicKey(b.publicKey), "salt");
    assert.notEqual(await encryptMessage(key, "same"), await encryptMessage(key, "same"));
  });

  it("rejects decryption with the wrong key", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const c = await generateKeyPair();
    const key = await deriveConversationKey(a.privateKey, await exportPublicKey(b.publicKey), "s");
    const wrong = await deriveConversationKey(a.privateKey, await exportPublicKey(c.publicKey), "s");
    const envelope = await encryptMessage(key, "hi");
    await assert.rejects(() => decryptMessage(wrong, envelope));
  });

  it("isEncrypted only matches the envelope, dmSalt is order-independent", () => {
    assert.equal(isEncrypted("plain"), false);
    assert.equal(isEncrypted(null), false);
    assert.equal(isEncrypted("osio-e2e:1:abc"), true);
    assert.equal(dmSalt("a", "b"), dmSalt("b", "a"));
  });
});
