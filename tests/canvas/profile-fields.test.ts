/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profile-fields.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

const { validateDisplayName, validatePronouns, validateHeadline, validateBio, validateLocation, validateCompany, validateWebsite, validateLinks, validateTimezone, validatePatreon, validateOrcid, diffProfile, toPatch } = await import("../../src/features/settings/profile/profileFields.ts");

const VALID_ORCID = "0000-0002-1825-0097";
const INVALID_ORCID_CHECK_DIGIT = "0000-0002-1825-0098";

test("validateDisplayName: accepts 1-100 single-line characters", () => {
  assert.equal(validateDisplayName("A"), null);
  assert.equal(validateDisplayName("Ada Lovelace"), null);
  assert.equal(validateDisplayName("a".repeat(100)), null);
});

test("validateDisplayName: rejects empty", () => {
  assert.equal(validateDisplayName(""), "Display name is required.");
});

test("validateDisplayName: rejects >100 characters", () => {
  assert.equal(validateDisplayName("a".repeat(101)), "Display name must be 100 characters or fewer.");
});

test("validateDisplayName: rejects newlines", () => {
  assert.equal(validateDisplayName("Ada\nLovelace"), "Display name must be a single line.");
});

test("validatePronouns: accepts up to 40 characters", () => {
  assert.equal(validatePronouns("she/her"), null);
  assert.equal(validatePronouns("they/them"), null);
  assert.equal(validatePronouns("a".repeat(40)), null);
});

test("validatePronouns: rejects >40 characters", () => {
  assert.equal(validatePronouns("a".repeat(41)), "Pronouns must be 40 characters or fewer.");
});

test("validateHeadline: accepts up to 200 characters", () => {
  assert.equal(validateHeadline("Mathematician"), null);
  assert.equal(validateHeadline("a".repeat(200)), null);
});

test("validateHeadline: rejects >200 characters", () => {
  assert.equal(validateHeadline("a".repeat(201)), "Headline must be 200 characters or fewer.");
});

test("validateBio: accepts up to 2000 characters with newlines", () => {
  assert.equal(validateBio("The first programmer.\n\nShe wrote the first algorithm."), null);
  assert.equal(validateBio("a".repeat(2000)), null);
});

test("validateBio: rejects >2000 characters", () => {
  assert.equal(validateBio("a".repeat(2001)), "Bio must be 2000 characters or fewer.");
});

test("validateLocation: accepts up to 120 characters", () => {
  assert.equal(validateLocation("London, UK"), null);
  assert.equal(validateLocation("a".repeat(120)), null);
});

test("validateLocation: rejects >120 characters", () => {
  assert.equal(validateLocation("a".repeat(121)), "Location must be 120 characters or fewer.");
});

test("validateCompany: accepts up to 100 characters", () => {
  assert.equal(validateCompany("Analytical Engines"), null);
  assert.equal(validateCompany("a".repeat(100)), null);
});

test("validateCompany: rejects >100 characters", () => {
  assert.equal(validateCompany("a".repeat(101)), "Company must be 100 characters or fewer.");
});

test("validateWebsite: accepts https:// URLs", () => {
  assert.equal(validateWebsite("https://example.com"), null);
  assert.equal(validateWebsite("https://example.com/path"), null);
});

test("validateWebsite: accepts http:// URLs, rejects other schemes", () => {
  assert.equal(validateWebsite("http://example.com"), null);
  assert.equal(validateWebsite("javascript:alert(1)"), "Website must start with http:// or https://.");
  assert.equal(validateWebsite("ftp://example.com"), "Website must start with http:// or https://.");
});

test("validateWebsite: rejects non-URLs", () => {
  assert.equal(validateWebsite("example.com"), "Website must start with http:// or https://.");
});

test("validateLinks: accepts up to 4 https:// links", () => {
  assert.equal(validateLinks(["https://a.com", "https://b.com"]), null);
  assert.equal(validateLinks(["https://a.com", "https://b.com", "https://c.com", "https://d.com"]), null);
});

test("validateLinks: rejects 5 links", () => {
  assert.equal(validateLinks(["https://a.com", "https://b.com", "https://c.com", "https://d.com", "https://e.com"]), "You can add up to 4 links.");
});

test("validateLinks: rejects http:// links", () => {
  assert.equal(validateLinks(["http://example.com"]), "Every link must start with https://.");
});

test("validateLinks: rejects non-URLs", () => {
  assert.equal(validateLinks(["example.com"]), "Every link must start with https://.");
});

test("validateTimezone: accepts valid IANA timezones", () => {
  assert.equal(validateTimezone("Europe/London"), null);
  assert.equal(validateTimezone("America/New_York"), null);
  assert.equal(validateTimezone("UTC"), null);
});

test("validateTimezone: rejects invalid timezones", () => {
  assert.equal(validateTimezone("Invalid/Timezone"), "Timezone is not recognised.");
});

test("validatePatreon: accepts valid handles", () => {
  assert.equal(validatePatreon("ada"), null);
  assert.equal(validatePatreon("Ada-Lovelace_123"), null);
  assert.equal(validatePatreon("a".repeat(64)), null);
});

test("validatePatreon: rejects invalid characters", () => {
  assert.equal(validatePatreon("ada@lovelace"), "Patreon handle must be 1-64 letters, numbers, hyphens or underscores.");
});

test("validatePatreon: rejects >64 characters", () => {
  assert.equal(validatePatreon("a".repeat(65)), "Patreon handle must be 1-64 letters, numbers, hyphens or underscores.");
});

test("validateOrcid: accepts valid ORCID with correct check digit", () => {
  assert.equal(validateOrcid(VALID_ORCID), null);
});

test("validateOrcid: rejects ORCID with wrong check digit", () => {
  assert.equal(validateOrcid(INVALID_ORCID_CHECK_DIGIT), "ORCID check digit is not valid.");
});

test("validateOrcid: rejects malformed ORCID", () => {
  assert.equal(validateOrcid("0000-0002-1825-009"), "ORCID must look like 0000-0002-1825-0097.");
  assert.equal(validateOrcid("XXXX-XXXX-XXXX-XXXX"), "ORCID must look like 0000-0002-1825-0097.");
});

test("diffProfile: returns only changed keys", () => {
  const base = { displayName: "Ada", pronouns: "she/her", headline: "Math", bio: "Bio", location: "London", company: "Engines", website: "https://a.com", links: ["https://a.com"], timezone: "Europe/London", orcid: VALID_ORCID, patreon: "ada" };
  const draft = { ...base, displayName: "Ada Lovelace", bio: "New bio" };
  const diff = diffProfile(base, draft);
  assert.deepEqual(Object.keys(diff).sort(), ["bio", "displayName"]);
  assert.equal(diff.displayName, "Ada Lovelace");
  assert.equal(diff.bio, "New bio");
});

test("diffProfile: returns empty when nothing changed", () => {
  const base = { displayName: "Ada", pronouns: "she/her" };
  const diff = diffProfile(base, base);
  assert.deepEqual(diff, {});
});

test("diffProfile: handles null/undefined values", () => {
  const base = { displayName: "Ada", pronouns: null };
  const draft = { displayName: "Ada", pronouns: "she/her" };
  const diff = diffProfile(base, draft);
  assert.deepEqual(Object.keys(diff), ["pronouns"]);
});
test("validateOrcid: an X check digit is computed, not just allowed", () => {
  assert.equal(validateOrcid("0000-0002-1694-233X"), null);
  assert.equal(validateOrcid("0000-0002-1694-2330"), "ORCID check digit is not valid.");
});

test("toPatch: an emptied field is sent as null, links stay an array", () => {
  assert.deepEqual(toPatch({ pronouns: "", links: ["https://a.com"] }), { pronouns: null, links: ["https://a.com"] });
});

test("diffProfile: links compare by content, not reference", () => {
  assert.deepEqual(diffProfile({ links: ["https://a.com"] }, { links: ["https://a.com"] }), {});
  assert.deepEqual(diffProfile({ links: ["https://a.com"] }, { links: ["https://b.com"] }), { links: ["https://b.com"] });
});
