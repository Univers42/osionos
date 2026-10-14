/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embeddable-url.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { embeddableUrl } from "../../src/widgets/embed-app/model/embeddableUrl.ts";

test("embed panes frame absolute http(s) URLs as given (trimmed)", () => {
  assert.equal(embeddableUrl("https://localhost:3002"), "https://localhost:3002");
  assert.equal(embeddableUrl("  http://example.test/app?x=1  "), "http://example.test/app?x=1");
  assert.equal(embeddableUrl("HTTPS://Example.test/"), "HTTPS://Example.test/");
});

test("embed panes refuse every other scheme, relative and malformed URLs", () => {
  const refused = [
    "app://osionos/",
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "blob:https://localhost:3000/uuid",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "/relative/path",
    "//evil.test/protocol-relative",
    "localhost:3002",
    "",
    "   ",
  ];
  for (const raw of refused) assert.equal(embeddableUrl(raw), "", raw);
});
