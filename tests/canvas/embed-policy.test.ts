/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embed-policy.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  EMBED_REFERRER_POLICY,
  GENERIC_ALLOW,
  PROVIDER_ALLOW,
  RICH_ALLOW,
  THIRD_PARTY_SANDBOX,
  allowForPolicy,
  clampEmbedHeight,
  grantsFullscreen,
  safeAspect,
} from "../../src/shared/lib/embed/embedPolicy.ts";

test("the policy constants are exactly the devil-ruled strings (C15)", () => {
  assert.equal(
    THIRD_PARTY_SANDBOX,
    "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation",
  );
  assert.equal(PROVIDER_ALLOW, "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share");
  assert.equal(GENERIC_ALLOW, "picture-in-picture");
  assert.equal(RICH_ALLOW, "autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share");
  assert.equal(EMBED_REFERRER_POLICY, "strict-origin-when-cross-origin");
});

test("the sandbox never carries top-navigation, modals, downloads or storage access", () => {
  for (const token of THIRD_PARTY_SANDBOX.split(" ")) {
    assert.doesNotMatch(token, /top-navigation|modals|downloads|storage-access/);
  }
  assert.doesNotMatch(GENERIC_ALLOW, /autoplay|clipboard-write|web-share/);
});

test("fullscreen is granted to provider players only, never to a generic or rich frame (C30)", () => {
  assert.equal(grantsFullscreen("provider"), true);
  assert.equal(grantsFullscreen("rich"), false);
  assert.equal(grantsFullscreen("generic"), false);
  assert.equal(allowForPolicy("provider"), PROVIDER_ALLOW);
  assert.equal(allowForPolicy("rich"), RICH_ALLOW);
  assert.equal(allowForPolicy("generic"), GENERIC_ALLOW);
  assert.match(PROVIDER_ALLOW, /fullscreen/);
  assert.doesNotMatch(RICH_ALLOW, /fullscreen/);
  assert.doesNotMatch(GENERIC_ALLOW, /fullscreen/);
  assert.equal(RICH_ALLOW, PROVIDER_ALLOW.replace("fullscreen; ", ""));
});

test("clampEmbedHeight: default, rounds, clamps to [120, 1600]", () => {
  for (const bad of [undefined, null, NaN, Infinity, -Infinity, "480", {}, [], true]) {
    assert.equal(clampEmbedHeight(bad), 480, String(bad));
  }
  assert.equal(clampEmbedHeight(119), 120);
  assert.equal(clampEmbedHeight(120), 120);
  assert.equal(clampEmbedHeight(0), 120);
  assert.equal(clampEmbedHeight(-50), 120);
  assert.equal(clampEmbedHeight(1600), 1600);
  assert.equal(clampEmbedHeight(1601), 1600);
  assert.equal(clampEmbedHeight(1e9), 1600);
  assert.equal(clampEmbedHeight(300.6), 301);
});

test("safeAspect keeps sane ratios and defaults everything else to 16/9", () => {
  assert.equal(safeAspect("16/9"), "16/9");
  assert.equal(safeAspect("4/1"), "4/1");
  assert.equal(safeAspect("1/4"), "1/4");
  assert.equal(safeAspect("4000/1000"), "4000/1000");
  assert.equal(safeAspect("0016/9"), "16/9");
  const bad = [
    "", "16:9", "16/", "/9", "a/b", "16/9 ", " 16/9", "16/9/1", "-1/2", "1.5/2", "0/5", "5/0", "0/0",
    "10000/1", "4001/1000", "5/1", "1/5", "4001/4001", "99999/1", "1/99999", 169, null, undefined, {},
  ];
  for (const value of bad) assert.equal(safeAspect(value), "16/9", String(value));
});
