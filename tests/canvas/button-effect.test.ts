/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   button-effect.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buttonEffect } from "@/entities/block/model/buttonEffect";

test("buttonEffect: program in preview does nothing", () => {
  assert.equal(buttonEffect({ buttonProgram: {} as never }, "preview"), "none");
});

test("buttonEffect: program in live runs", () => {
  assert.equal(buttonEffect({ buttonProgram: {} as never }, "live"), "run-program");
});

test("buttonEffect: page:// opens page in both modes", () => {
  assert.equal(buttonEffect({ buttonHref: "page://abc" }, "preview"), "open-page");
  assert.equal(buttonEffect({ buttonHref: "page://abc" }, "live"), "open-page");
});

test("buttonEffect: /path is an anchor", () => {
  assert.equal(buttonEffect({ buttonHref: "/foo" }, "preview"), "anchor");
  assert.equal(buttonEffect({ buttonHref: "/foo" }, "live"), "anchor");
});

test("buttonEffect: otherwise none", () => {
  assert.equal(buttonEffect({ buttonHref: "https://x" }, "live"), "none");
  assert.equal(buttonEffect({}, "live"), "none");
});

test("buttonEffect: program takes precedence over href", () => {
  assert.equal(buttonEffect({ buttonProgram: {} as never, buttonHref: "page://abc" }, "preview"), "none");
  assert.equal(buttonEffect({ buttonProgram: {} as never, buttonHref: "page://abc" }, "live"), "run-program");
});
