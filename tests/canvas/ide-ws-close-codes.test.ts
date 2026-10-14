/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-ws-close-codes.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  IDE_TOKEN_EXPIRED_CLOSE,
  LSP_OUT_OF_MEMORY_CLOSE,
  healthFromCloseCode,
  isDeliberateClose,
  isLspOutOfMemoryClose,
  isTokenExpiredClose,
} from "../../src/features/ide/model/wsCloseCodes.ts";

import { lspServerFor, lspServerLabel } from "../../src/features/ide/model/lspClient.ts";

test("4011 is the IDE token expiry: not deliberate, token-expired, no health verdict", () => {
  assert.equal(IDE_TOKEN_EXPIRED_CLOSE, 4011);
  assert.equal(isDeliberateClose(4011), false);
  assert.equal(isTokenExpiredClose(4011), true);
  assert.equal(healthFromCloseCode(4011), null);
});

test("every other code keeps its meaning", () => {
  assert.equal(isTokenExpiredClose(4001), false);
  assert.equal(isTokenExpiredClose(1006), false);
  assert.equal(isDeliberateClose(1000), true);
  assert.equal(isDeliberateClose(4001), true);
  assert.equal(isDeliberateClose(4010), true);
  assert.equal(isDeliberateClose(4012), true);
  assert.equal(isDeliberateClose(4029), false);
  assert.equal(isDeliberateClose(1006), false);
  assert.equal(healthFromCloseCode(4001), "disabled");
  assert.equal(healthFromCloseCode(4003), "disabled");
  assert.equal(healthFromCloseCode(4004), "unavailable");
  assert.equal(healthFromCloseCode(4029), null);
});

test("4137 is LSP out of memory: deliberate, LSP OOM, no health verdict", () => {
  assert.equal(LSP_OUT_OF_MEMORY_CLOSE, 4137);
  assert.equal(isLspOutOfMemoryClose(4137), true);
  assert.equal(isLspOutOfMemoryClose(1000), false);
  assert.equal(isDeliberateClose(4137), true);
  assert.equal(healthFromCloseCode(4137), null);
});

test("lspServerFor maps java and falls back to null", () => {
  assert.equal(lspServerFor("java"), "java");
  assert.equal(lspServerFor("typescript"), "typescript");
  assert.equal(lspServerFor("unknown"), null);
});

test("lspServerLabel returns friendly names and falls back to key", () => {
  assert.equal(lspServerLabel("java"), "Java");
  assert.equal(lspServerLabel("typescript"), "TypeScript");
  assert.equal(lspServerLabel("python"), "Python");
  assert.equal(lspServerLabel("go"), "Go");
  assert.equal(lspServerLabel("rust"), "Rust");
  assert.equal(lspServerLabel("clangd"), "C/C++");
  assert.equal(lspServerLabel("unknown"), "unknown");
});
