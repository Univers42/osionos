/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embed-provider-hosts.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Provider rules must match the host the URL really has: a user-owned subdomain
// (someone-x.web.val.town) or a lookalike suffix must never inherit a provider's allow.

import assert from "node:assert/strict";
import test from "node:test";

import { resolveProviderEmbed } from "../../src/shared/lib/embed/embedProviders.ts";
import { LINKS } from "./embed-links.corpus.ts";

const srcOf = (url: string): string | null => resolveProviderEmbed(url)?.src ?? null;

test("a lookalike suffix host (<provider host>.evil.example) is never a provider embed", () => {
  for (const link of LINKS.filter((entry) => entry.expect === "embed")) {
    if (!URL.canParse(link.url)) continue;
    const parsed = new URL(link.url);
    parsed.hostname = `${parsed.hostname}.evil.example`;
    assert.equal(resolveProviderEmbed(parsed.href), null, `${link.provider}: ${parsed.href.slice(0, 90)}`);
  }
});

test("val.town: only val.town itself, never a user's <name>.web.val.town site", () => {
  assert.equal(resolveProviderEmbed("https://someone-x.web.val.town/"), null);
  assert.equal(resolveProviderEmbed("https://someone-x.web.val.town/v/a.b"), null);
  assert.equal(resolveProviderEmbed("https://evil.example/embed/someone.val"), null);
  assert.equal(srcOf("https://www.val.town/v/stevekrouse.whatIsValTown")?.startsWith("https://val.town/embed/"), true);
});

test("pass-through providers keep to their own exact host", () => {
  const tricks = [
    "https://evil.excalidraw.com/#room=abc,def",
    "https://excalidraw.com.evil.example/#room=abc,def",
    "https://evil.link.excalidraw.com/l/abc/def",
    "https://simplepdf.eu.evil.example/editor?open=https://a.io/x.pdf",
    "https://evil.simplepdf.eu/editor",
    "https://stackblitz.com.evil.example/edit/vitejs-vite",
    "https://evil.stackblitz.com/edit/vitejs-vite",
    "https://desmos.com.evil.example/calculator/abc123",
    "https://evil.openstreetmap.org/export/embed.html?bbox=1,2,3,4",
    "https://calendar.google.com.evil.example/calendar/embed?src=a%40b.co",
    "https://evil.figma.com/embed?embed_host=share&url=https://www.figma.com/file/x",
    "https://forms.office.com.evil.example/Pages/ResponsePage.aspx?id=x",
    "https://evil.facebook.com/plugins/post.php?href=https://www.facebook.com/x/posts/1",
  ];
  for (const url of tricks) assert.equal(resolveProviderEmbed(url), null, url);
});

test("a backslash before @ cannot make the hand-rolled parser see a different host than the browser", () => {
  for (const url of [
    "https://evil.example\\@www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://evil.example\\@open.spotify.com/track/abc123",
  ]) {
    const embed = resolveProviderEmbed(url);
    assert.equal(embed, null, `${url} must be refused, got ${embed?.src ?? "null"}`);
  }
});
