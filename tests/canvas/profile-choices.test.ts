// The choices behind the profile edit form: pronoun presets, status presets and the emoji
// restriction, the country list with its location parse / compose, and link kinds by host.

import assert from "node:assert/strict";
import test from "node:test";

const pronouns = await import("../../src/features/settings/profile/pronounChoices.ts");
const status = await import("../../src/features/settings/profile/statusChoices.ts");
const places = await import("../../src/features/settings/profile/countries.ts");
const kinds = await import("../../src/features/settings/profile/linkKinds.ts");

test("pronouns: a preset selects itself, empty selects none, anything else is custom", () => {
  assert.deepEqual(pronouns.pronounSelection(""), { choice: "", custom: "" });
  assert.deepEqual(pronouns.pronounSelection("she/her"), { choice: "she/her", custom: "" });
  assert.deepEqual(pronouns.pronounSelection("prefer not to say"), { choice: "prefer not to say", custom: "" });
  assert.deepEqual(pronouns.pronounSelection("xe/xem"), { choice: pronouns.PRONOUN_CUSTOM, custom: "xe/xem" });
  assert.deepEqual(pronouns.PRONOUN_PRESETS, ["she/her", "he/him", "they/them", "prefer not to say"]);
  assert.equal(pronouns.PRONOUN_MAX, 40);
});

test("status emoji: only emoji, at most 8 code points", () => {
  for (const ok of ["🎯", "🏖️", "👩‍💻", "🇫🇷", "👍🏽", "1️⃣"]) assert.equal(status.isStatusEmoji(ok), true, ok);
  for (const bad of ["", "a", "12", "hello", "🎯a", "icon:star", "<svg>", "🎯🎯🎯🎯🎯🎯🎯🎯🎯"]) assert.equal(status.isStatusEmoji(bad), false, bad);
});

test("status presets are emoji + text within the bridge limits, and expiry starts at never", () => {
  assert.ok(status.STATUS_PRESETS.length >= 4);
  for (const preset of status.STATUS_PRESETS) {
    assert.equal(status.isStatusEmoji(preset.emoji), true, preset.text);
    assert.ok(preset.text.length > 0 && preset.text.length <= 120);
  }
  assert.deepEqual(status.EXPIRY_CHOICES[0], { label: "Never", minutes: 0 });
  assert.equal(status.expiryIso(0, 1000), "");
  assert.equal(status.expiryIso(30, Date.parse("2026-11-17T12:00:00Z")), "2026-11-17T12:30:00.000Z");
});

test("countries: ISO list named by Intl, sorted, unique", () => {
  const options = places.countryOptions();
  assert.ok(options.length > 190);
  assert.equal(new Set(options.map((o: { code: string }) => o.code)).size, options.length);
  assert.equal(options.find((o: { code: string }) => o.code === "FR")?.name, "France");
  const names = options.map((o: { name: string }) => o.name);
  assert.deepEqual(names, [...names].sort((a: string, b: string) => a.localeCompare(b, "en")));
});

test("location: compose and parse round-trip City, Country", () => {
  assert.equal(places.composeLocation({ country: "GB", city: "London" }), "London, United Kingdom");
  assert.equal(places.composeLocation({ country: "GB", city: "" }), "United Kingdom");
  assert.equal(places.composeLocation({ country: "", city: "Lyon" }), "Lyon");
  assert.equal(places.composeLocation({ country: "", city: "" }), "");
  assert.deepEqual(places.parseLocation("London, United Kingdom"), { country: "GB", city: "London" });
  assert.deepEqual(places.parseLocation("France"), { country: "FR", city: "" });
  assert.deepEqual(places.parseLocation(""), { country: "", city: "" });
});

test("location: free text from before the form stays as the city so it is never lost", () => {
  assert.deepEqual(places.parseLocation("New York, NY"), { country: "", city: "New York, NY" });
  assert.deepEqual(places.parseLocation("Somewhere"), { country: "", city: "Somewhere" });
  assert.equal(places.composeLocation(places.parseLocation("New York, NY")), "New York, NY");
});

test("location: the combined text honours the 120-character column", () => {
  assert.equal(places.LOCATION_MAX, 120);
  assert.equal(places.locationFits({ country: "GB", city: "x".repeat(104) }), true);
  assert.equal(places.locationFits({ country: "GB", city: "x".repeat(105) }), false);
});

test("link kinds follow the host, subdomains included, and fall back to site", () => {
  const cases: Array<[string, string]> = [
    ["https://github.com/ada", "github"], ["https://gist.github.com/ada", "github"],
    ["https://www.linkedin.com/in/ada", "linkedin"], ["https://gitlab.com/ada", "gitlab"],
    ["https://x.com/ada", "x"], ["https://twitter.com/ada", "x"], ["https://www.youtube.com/@ada", "youtube"],
    ["https://ada.example.com/about", "site"], ["https://notgithub.com/ada", "site"],
    ["https://github.com.evil.example/ada", "site"], ["not a url", "site"], ["", "site"],
  ];
  for (const [url, kind] of cases) assert.equal(kinds.linkKind(url), kind, url);
  assert.equal(kinds.LINK_KIND_LABEL.github, "GitHub");
  assert.equal(kinds.LINK_KIND_LABEL.site, "Website");
});
