/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profile-sidebar.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The profile sidebar's model: which rows a profile yields for a visitor and for its owner,
// the status as the card serves it, and the call-to-action rows only an owner sees.

import assert from "node:assert/strict";
import test from "node:test";

const { buildSidebar } = await import("../../src/widgets/profile-page/model/sidebarModel.ts");
const { activeStatus, parseStatus } = await import("../../src/widgets/profile-page/model/profileStatus.ts");

const NOW = new Date("2026-11-17T12:00:00Z");
const FULL = {
  userId: "u1", name: "Ada Lovelace", avatar: null, role: "Member", workspaceId: "ws", lastSeenAt: null, online: true,
  username: "ada", pronouns: "she/her", headline: "Analyst", bio: "Notes on the engine", location: "London, United Kingdom",
  company: "Analytical Engines", website: "https://ada.example.com/about", links: ["https://github.com/ada"],
  timezone: "Europe/London", orcid: "0000-0002-1825-0097", patreon: "adadraws",
  status: { emoji: "🎯", text: "Focusing", expiresAt: null, busy: true },
} as never;

const without = (field: string) => ({ ...(FULL as object), [field]: null }) as never;
const build = (profile: never, isOwner = false) => buildSidebar(profile, { isOwner, now: NOW });
const ids = (profile: never, isOwner = false) => build(profile, isOwner).facts.map((fact: { id: string }) => fact.id);

test("a full profile yields every identity field and every fact, for a visitor and for its owner", () => {
  for (const isOwner of [false, true]) {
    const model = build(FULL, isOwner);
    assert.deepEqual(
      [model.name, model.username, model.pronouns, model.headline, model.bio],
      ["Ada Lovelace", "ada", "she/her", "Analyst", "Notes on the engine"],
    );
    assert.deepEqual(ids(FULL, isOwner), ["company", "location", "time", "link:0", "link:1", "orcid", "patreon"]);
    assert.deepEqual(model.prompts, []);
    assert.deepEqual(model.status, { emoji: "🎯", text: "Focusing", busy: true });
  }
});

for (const field of ["pronouns", "headline", "bio"] as const) {
  test(`${field} absent: no row for a visitor, still no row for the owner`, () => {
    for (const isOwner of [false, true]) assert.equal(build(without(field), isOwner)[field], null);
  });
}

test("username absent yields null, not an empty @", () => {
  assert.equal(build(without("username")).username, null);
});

for (const [field, factId] of [["company", "company"], ["location", "location"], ["orcid", "orcid"], ["patreon", "patreon"]] as const) {
  test(`${field}: its fact exists only when the field does, for a visitor and for its owner`, () => {
    for (const isOwner of [false, true]) {
      assert.ok(ids(FULL, isOwner).includes(factId));
      assert.ok(!ids(without(field), isOwner).includes(factId));
    }
  });
}

test("timezone absent or unknown yields no local time instead of a wrong one", () => {
  assert.ok(!ids(without("timezone")).includes("time"));
  assert.ok(!ids({ ...(FULL as object), timezone: "Nowhere/Land" } as never).includes("time"));
});

test("the local time is formatted in the profile's zone", () => {
  const time = build({ ...(FULL as object), timezone: "Asia/Tokyo" } as never).facts.find((fact: { id: string }) => fact.id === "time");
  assert.match(time.label, /9:00|21:00/);
});

test("links: the website first, then the links; a non-http entry and a bad ORCID are dropped", () => {
  const profile = { ...(FULL as object), website: "javascript:alert(1)", links: ["https://a.example/x", "ftp://b.example"], orcid: "nope" } as never;
  const model = build(profile);
  const links = model.facts.filter((fact: { id: string }) => fact.id.startsWith("link:"));
  assert.deepEqual(links.map((fact: { label: string; href: string }) => [fact.label, fact.href]), [["a.example", "https://a.example/x"]]);
  assert.ok(!ids(profile).includes("orcid"));
});

test("a visitor never gets a call-to-action row, however empty the profile is", () => {
  const empty = { userId: "u2", name: "Bare", avatar: null, role: null, workspaceId: null, lastSeenAt: null, online: false } as never;
  const model = build(empty, false);
  assert.deepEqual(model.prompts, []);
  assert.deepEqual(model.facts, []);
});

test("the owner of an empty profile gets one row per empty section, in page order", () => {
  const empty = { userId: "u2", name: "Bare", avatar: null, role: null, workspaceId: null, lastSeenAt: null, online: false } as never;
  assert.deepEqual(
    build(empty, true).prompts.map((prompt: { field: string; label: string }) => [prompt.field, prompt.label]),
    [["headline", "Add a headline"], ["bio", "Add a bio"], ["location", "Add your location"], ["links", "Add a link"]],
  );
});

test("each prompt disappears when its section has data", () => {
  const fields = ["headline", "bio", "location"] as const;
  for (const field of fields) {
    assert.ok(!build(FULL, true).prompts.some((prompt: { field: string }) => prompt.field === field));
    assert.ok(build(without(field), true).prompts.some((prompt: { field: string }) => prompt.field === field));
  }
  const noLinks = { ...(FULL as object), website: null, links: [] } as never;
  assert.ok(build(noLinks, true).prompts.some((prompt: { field: string }) => prompt.field === "links"));
  assert.ok(!build({ ...(FULL as object), website: null } as never, true).prompts.some((prompt: { field: string }) => prompt.field === "links"));
});

test("presence reads as role and Online now / Offline", () => {
  assert.equal(build(FULL).presence, "Member · Online now");
  assert.equal(build({ ...(FULL as object), online: false, role: null } as never).presence, "Offline");
});

test("parseStatus: the card's shape is typed, anything else is no status", () => {
  assert.deepEqual(parseStatus({ emoji: "🎯", text: "Focusing", expiresAt: "2026-11-18T00:00:00Z", busy: false }),
    { emoji: "🎯", text: "Focusing", expiresAt: "2026-11-18T00:00:00Z", busy: false });
  assert.deepEqual(parseStatus({ text: 5, emoji: ["x"], busy: "yes" }), { emoji: null, text: null, expiresAt: null, busy: false });
  for (const junk of [null, undefined, "x", 3, []]) assert.equal(parseStatus(junk), null);
});

test("activeStatus: empty, expired and busy-only statuses", () => {
  const base = { emoji: null, text: null, expiresAt: null, busy: false };
  assert.equal(activeStatus(null, NOW), null);
  assert.equal(activeStatus(base, NOW), null);
  assert.equal(activeStatus({ ...base, text: "Out", expiresAt: "2026-11-17T11:59:59Z" }, NOW), null);
  assert.deepEqual(activeStatus({ ...base, text: "Out", expiresAt: "2026-11-17T12:00:01Z" }, NOW), { emoji: null, text: "Out", busy: false });
  assert.deepEqual(activeStatus({ ...base, busy: true }, NOW), { emoji: null, text: null, busy: true });
  assert.equal(activeStatus({ ...base, text: "x", expiresAt: "garbage" }, NOW)?.text, "x");
});
