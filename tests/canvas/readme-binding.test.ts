/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   readme-binding.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
	README_FIELDS,
	BoundFieldEmptyText,
	BoundRecordProvider,
	boundFieldText,
	isReadmeField,
	resolveBoundField,
	type BoundRecord,
} from "../../src/entities/block/model/binding.ts";
import { BoundFieldReadOnly } from "../../src/entities/block/ui/BoundFieldReadOnly.tsx";
import { toReadmeRecord } from "../../src/widgets/profile-page/model/binding.tsx";
import type { MemberProfile } from "../../src/widgets/profile-page/useProfile.ts";

const KEYS = [
	"displayName", "username", "pronouns", "headline", "bio", "location", "company",
	"website", "links", "timezone", "orcid", "patreon", "profession",
];

const profile = (extra: Record<string, unknown> = {}): MemberProfile => ({
	userId: "u1", name: "Ada", avatar: null, role: "admin", workspaceId: null,
	lastSeenAt: "now", online: true, username: "ada", headline: "Engineer", bio: "",
	pronouns: null, links: ["https://a.example", "https://b.example"], profession: "student",
	customFields: { secret: "x" }, directoryOptOut: true, readmePageId: "p9", version: 3,
	email: "ada@example.com", ...extra,
} as unknown as MemberProfile);

const html = (record: BoundRecord | null, fieldBind: string, emptyText?: string | null): string => {
	const block = { id: "b", type: "paragraph", content: "", recordRef: "$record", fieldBind } as never;
	let tree: React.ReactElement = React.createElement(BoundFieldReadOnly, { block });
	if (emptyText !== undefined) tree = React.createElement(BoundFieldEmptyText.Provider, { value: emptyText }, tree);
	return renderToStaticMarkup(React.createElement(BoundRecordProvider, { value: record }, tree));
};

test("README_FIELDS is exactly the thirteen public keys, in order", () => {
	assert.deepEqual(README_FIELDS.map((field) => field.key), KEYS);
});

test("isReadmeField accepts the allowlist and refuses everything else", () => {
	for (const key of KEYS) assert.equal(isReadmeField(key), true, key);
	for (const bad of ["", "email", "custom:x", "constructor", "__proto__", " headline", null, 3, {}, undefined]) {
		assert.equal(isReadmeField(bad), false, String(bad));
	}
});

test("resolveBoundField reads own properties only", () => {
	for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
		assert.equal(resolveBoundField({ id: "u" }, key), undefined, key);
		assert.equal(resolveBoundField({ id: "u", customFields: {} }, `custom:${key}`), undefined, `custom:${key}`);
	}
	assert.equal(resolveBoundField({ id: "u", headline: "h", customFields: { a: 1 } }, "headline"), "h");
	assert.equal(resolveBoundField({ id: "u", customFields: { a: 1 } }, "custom:a"), 1);
});

test("toReadmeRecord copies only the allowlist and drops empty values", () => {
	const record = toReadmeRecord(profile())!;
	for (const key of ["email", "directoryOptOut", "readmePageId", "version", "role", "online", "customFields", "lastSeenAt", "joinedAt"]) {
		assert.equal(Object.hasOwn(record, key), false, key);
	}
	for (const key of ["bio", "pronouns"]) assert.equal(Object.hasOwn(record, key), false, key);
	assert.deepEqual(record.links, ["https://a.example", "https://b.example"]);
	assert.equal(record.displayName, "Ada");
	assert.equal(record.id, "u1");
});

test("toReadmeRecord drops an empty array and maps a profession id to its label", () => {
	assert.equal(Object.hasOwn(toReadmeRecord(profile({ links: [] }))!, "links"), false);
	assert.equal(toReadmeRecord(profile())!.profession, "Student");
	assert.equal(toReadmeRecord(profile({ profession: "wizard" }))!.profession, "wizard");
});

test("toReadmeRecord(null) is null and a hostile __proto__ key does not pollute", () => {
	assert.equal(toReadmeRecord(null), null);
	const hostile = JSON.parse('{"__proto__":{"polluted":true},"headline":"h"}');
	const record = toReadmeRecord(profile(hostile))!;
	assert.equal(({} as Record<string, unknown>).polluted, undefined);
	assert.equal(Object.getPrototypeOf(record), Object.prototype);
	assert.equal(record.polluted, undefined);
});

test("boundFieldText: missing is null, an array joins with a comma", () => {
	assert.equal(boundFieldText({ id: "u" }, "headline"), null);
	assert.equal(boundFieldText({ id: "u", links: ["a", "b"] }, "links"), "a, b");
	assert.equal(boundFieldText({ id: "u", links: [] }, "links"), null);
});

test("a README renders nothing for a missing key, an admin template keeps the dash", () => {
	const record = { id: "u", headline: "" };
	assert.equal(html({ id: "u" }, "email", null), "");
	assert.equal(html(record, "headline", null), "");
	assert.match(html(record, "headline"), />—</);
	assert.match(html({ id: "u", customFields: {} }, "custom:missing"), />—</);
	assert.match(html({ id: "u", links: ["a", "b"] }, "links", null), />a, b</);
});

test("outside a provider the italic field name still shows", () => {
	const block = { id: "b", type: "paragraph", content: "", recordRef: "$record", fieldBind: "headline" } as never;
	assert.match(renderToStaticMarkup(React.createElement(BoundFieldReadOnly, { block })), /italic[^>]*>headline</);
});
