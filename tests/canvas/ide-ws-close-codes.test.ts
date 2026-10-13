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
  healthFromCloseCode,
  isDeliberateClose,
  isTokenExpiredClose,
} from "../../src/features/ide/model/wsCloseCodes.ts";

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
