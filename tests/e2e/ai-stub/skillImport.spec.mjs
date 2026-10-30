/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   skillImport.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Importing an opencode SKILL.md into the workspace skills (#78 P5b), in a browser: the file
// only fills the form; nothing is sent until the person presses "Create skill". The service
// is the stub host of PLAYWRIGHT_AI_STUB, answered here.

import { expect, test } from "@playwright/test";

import { openSettings } from "../support/settingsHelpers.mjs";

const SKILL_MD = `---
name: git-release
description: Create consistent releases and changelogs
license: MIT
compatibility: opencode
---

## What I do
- Draft release notes from merged PRs
`;

/** Answers the skills routes of the AI host; returns the bodies POSTed to them. */
async function stubSkills(page) {
  const created = [];
  await page.route("https://ai.invalid/**", (route) => {
    const request = route.request();
    if (!new URL(request.url()).pathname.endsWith("/skills")) {
      return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      created.push(body);
      return route.fulfill({ status: 201, json: { id: "s1", version: 1, inIndex: true, ...body } });
    }
    return route.fulfill({ json: { skills: [] } });
  });
  return created;
}

test("an opencode SKILL.md fills the skill form, and only Create sends it", async ({ page, baseURL }, testInfo) => {
  const created = await stubSkills(page);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await openSettings(page, "AI connections");
  const panel = page.locator("section", { has: page.getByRole("heading", { name: "Workspace skills" }) });
  await expect(panel).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await panel.getByRole("button", { name: "Import SKILL.md" }).click();
  await (await chooser).setFiles({ name: "SKILL.md", mimeType: "text/markdown", buffer: Buffer.from(SKILL_MD) });
  await expect(panel.getByLabel("Id")).toHaveValue("git-release");
  await expect(panel.getByLabel("Description (one line, shown to the assistant)")).toHaveValue("Create consistent releases and changelogs");
  await expect(panel.getByLabel("Text")).toHaveValue("## What I do\n- Draft release notes from merged PRs");
  await panel.screenshot({ path: testInfo.outputPath("skill-imported.png") });
  expect(created).toEqual([]);

  await panel.getByRole("button", { name: "Create skill" }).click();
  await expect.poll(() => created.length).toBe(1);
  expect(created[0]).toMatchObject({ slug: "git-release", name: "git-release" });
});
