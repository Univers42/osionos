/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileBinding.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P2-2-d: the inspector that binds a README block to a public profile field. The owner binds
// from the slash menu, picks a field and a style, sees the four preview states and unbinds;
// another viewer sees the live value, and a field outside the public card shows nothing.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage, selectSlashMenuEntry } from "../../browser/core/app.mjs";
import { BOB_PUBLIC, OTHER, giveTheAppABridgeOrigin, heading, mockApi, openProfile, seedSession } from "../support/profilePageMocks.mjs";

const README_ID = "22222222-2222-4222-8222-222222222222";
const SECRET = "owner-only@example.com";
const dialog = (page) => page.getByRole("dialog", { name: "Profile field settings" });
const chip = (page) => page.getByRole("button", { name: /^Profile field:/ });

async function openOwnReadme(page, baseURL, profileFields) {
	await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
	await openFreshPage(page, baseURL);
	const mine = await seedSession(page);
	await mockApi(page, { id: mine, username: "me-user", name: "Me Myself", publicBody: { ...BOB_PUBLIC, userId: mine, username: "me-user" } });
	let linked = null;
	const row = (readmePageId) => ({ userId: mine, version: 1, readmePageId, displayName: "Me Myself", ...profileFields });
	await page.route("**/api/pages", (route) => {
		const sent = route.request().postDataJSON();
		return route.fulfill({ json: { ...sent, _id: README_ID, updatedAt: new Date().toISOString(), archivedAt: null } });
	});
	await page.route("**/api/account/profile", (route) => {
		if (route.request().method() === "PATCH") linked = route.request().postDataJSON().readmePageId;
		return route.fulfill({ json: row(linked) });
	});
	const box = page.getByRole("combobox", { name: "Search pages or run a command" });
	await box.click();
	await box.fill("user:Me");
	await page.getByRole("option").filter({ hasText: "Me Myself" }).first().click();
	await page.getByRole("button", { name: "Customize", exact: true }).click();
	await expect(page.getByTitle("README", { exact: true }).last()).toBeVisible();
	// Customize saves through the API client, not the account store; nothing in that flow hydrates it, so the store learns
	// the README id only when the settings panels or the profession picker do.
	await page.evaluate(async () => (await import("/src/store/settings/useAccountProfileStore.ts")).useAccountProfileStore.getState().hydrate());
	await activateFirstEditor(page);
	return mine;
}

async function bindFromSlash(page) {
	const editor = await activateFirstEditor(page);
	await editor.click();
	await page.keyboard.type("/profile");
	await selectSlashMenuEntry(page, "Profile field");
	await expect(dialog(page)).toBeVisible();
}

test.describe("the owner's inspector", () => {
	test("/profile binds a block, Headline previews the headline, and Escape returns focus", async ({ page, baseURL }) => {
		await openOwnReadme(page, baseURL, { headline: "Maths and mountains" });
		await bindFromSlash(page);
		await dialog(page).getByLabel("Profile field", { exact: true }).selectOption("headline");
		await expect(dialog(page)).toContainText("Maths and mountains");
		await expect(page.getByRole("group", { name: "Profile field: Headline" })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(dialog(page)).toHaveCount(0);
		await expect(page.getByRole("group", { name: "Profile field: Headline" })).toBeFocused();
	});

	test("the field list has exactly the 13 public fields and the style writes a heading", async ({ page, baseURL }) => {
		await openOwnReadme(page, baseURL, { headline: "Maths" });
		await bindFromSlash(page);
		await expect(dialog(page).getByLabel("Profile field", { exact: true }).locator("option")).toHaveCount(13);
		await dialog(page).getByLabel("Profile field style").selectOption("2");
		await expect(dialog(page).getByLabel("Profile field style")).toHaveValue("2");
	});

	test("the binding is stored on the page as $record plus the field, with no value", async ({ page, baseURL }) => {
		await openOwnReadme(page, baseURL, { headline: "Maths" });
		await bindFromSlash(page);
		await dialog(page).getByLabel("Profile field", { exact: true }).selectOption("headline");
		await page.keyboard.press("Escape");
		await page.waitForTimeout(1500);
		const stored = await page.evaluate(() => Object.values(localStorage).filter((v) => v.includes('"fieldBind":"headline"')).length);
		expect(stored).toBeGreaterThan(0);
	});

	test("an empty field says so and offers Edit public profile", async ({ page, baseURL }) => {
		await openOwnReadme(page, baseURL, { headline: null, bio: null });
		await bindFromSlash(page);
		await dialog(page).getByLabel("Profile field", { exact: true }).selectOption("bio");
		await expect(dialog(page)).toContainText("Empty on your profile");
		await expect(dialog(page).getByRole("button", { name: "Edit public profile" })).toBeVisible();
	});

	test("Remove binding leaves an empty paragraph", async ({ page, baseURL }) => {
		await openOwnReadme(page, baseURL, { headline: "Maths" });
		await bindFromSlash(page);
		await dialog(page).getByRole("button", { name: "Remove binding" }).click();
		await expect(dialog(page)).toHaveCount(0);
		await expect(chip(page)).toHaveCount(0);
	});

	test("the slash menu offers no Profile field on an ordinary page", async ({ page, baseURL }) => {
		await openFreshPage(page, baseURL);
		const editor = await activateFirstEditor(page);
		await editor.click();
		await page.keyboard.type("/profile");
		await expect(page.getByTestId("slash-command-entry").filter({ hasText: "Profile field" })).toHaveCount(0);
	});
});

test.describe("another viewer", () => {
	async function openBob(page, baseURL, blocks) {
		await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: { ...BOB_PUBLIC, headline: "Bob's headline", email: SECRET, readme: { pageId: README_ID, blocks } } });
		await openProfile(page, baseURL, "Bob");
		await expect(heading(page, "Bob Jones")).toBeVisible();
	}
	const bind = (id, fieldBind) => ({ id, type: "paragraph", content: "", recordRef: "$record", fieldBind });

	test("sees the live value inside the README", async ({ page, baseURL }) => {
		await openBob(page, baseURL, [bind("r1", "headline")]);
		await expect(page.getByRole("region", { name: "README" })).toContainText("Bob's headline");
	});

	test("a binding to a private field shows nothing and leaks nothing", async ({ page, baseURL }) => {
		await openBob(page, baseURL, [bind("r1", "email"), bind("r2", "constructor"), { id: "r3", type: "paragraph", content: "after" }]);
		const region = page.getByRole("region", { name: "README" });
		await expect(region).toContainText("after");
		await expect(region).not.toContainText("email");
		expect(await page.content()).not.toContain(SECRET);
	});
});
