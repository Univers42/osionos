/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   duplicateTitleNumbering.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: codex <codex@openai.com>                   +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/29 00:00:00 by codex             #+#    #+#             */
/*   Updated: 2026/04/29 00:00:00 by codex            ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  openSidebarPageOptions,
  primeLocalState,
  readPagesCache,
  sidebarPageRow,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

function pageEntry({
  id,
  title,
  parentPageId = null,
}) {
  return {
    _id: id,
    title,
    workspaceId: "mock-ws-private-0",
    ownerId: "mock-user-0",
    visibility: "private",
    collaborators: [],
    parentPageId,
    databaseId: null,
    archivedAt: null,
    content: [
      {
        id: `${id}-block`,
        type: "paragraph",
        content: title,
      },
    ],
  };
}

async function openFixture(page, appUrl, pages) {
  await primeLocalState(page, {
    activeUserId: "mock-user-0",
    activeWorkspaceByUser: {
      "mock-user-0": "mock-ws-private-0",
    },
    pages: {
      "mock-ws-private-0": pages,
    },
  });
  await page.goto(appUrl, { waitUntil: "networkidle" });
}

async function duplicatePageFromSidebar(page, pageId) {
  await openSidebarPageOptions(page, pageId);
  await page.getByRole("button", { name: "Duplicate" }).click();
}

async function workspacePages(page) {
  const pages = await readPagesCache(page);
  return pages["mock-ws-private-0"] ?? [];
}

export const duplicateTitleNumberingScenarios = [
  defineScenario(
    "34. Duplicate Title Numbering",
    "First duplicate",
    "duplicating a page appends (1) and preserves the original title",
    async ({ page, appUrl }) => {
      await openFixture(page, appUrl, [
        pageEntry({ id: "duplicate-root", title: "Release plan" }),
      ]);

      await duplicatePageFromSidebar(page, "duplicate-root");

      await expect(sidebarPageRow(page, "duplicate-root")).toContainText("Release plan");
      await expect(
        page.getByTestId("sidebar-page-row").filter({ hasText: /^Release plan \(1\)/ }),
      ).toHaveCount(1);

      const pages = await workspacePages(page);
      expect(pages.some((entry) => entry.title === "Release plan")).toBe(true);
      expect(pages.some((entry) => entry.title === "Release plan (1)")).toBe(true);
      expect(pages.some((entry) => /\(Copy\)/.test(entry.title))).toBe(false);
    },
  ),
  defineScenario(
    "34. Duplicate Title Numbering",
    "Incremental numbering",
    "each new duplicate increments to the next number instead of reusing earlier titles",
    async ({ page, appUrl }) => {
      await openFixture(page, appUrl, [
        pageEntry({ id: "duplicate-root", title: "Release plan" }),
      ]);

      await duplicatePageFromSidebar(page, "duplicate-root");
      await duplicatePageFromSidebar(page, "duplicate-root");
      await duplicatePageFromSidebar(page, "duplicate-root");

      const pages = await workspacePages(page);
      const titles = pages.map((entry) => entry.title);

      expect(titles.filter((title) => title === "Release plan").length).toBe(1);
      expect(titles.filter((title) => title === "Release plan (1)").length).toBe(1);
      expect(titles.filter((title) => title === "Release plan (2)").length).toBe(1);
      expect(titles.filter((title) => title === "Release plan (3)").length).toBe(1);
    },
  ),
  defineScenario(
    "34. Duplicate Title Numbering",
    "Existing suffixes",
    "when a numbered duplicate already exists the next free number is used",
    async ({ page, appUrl }) => {
      await openFixture(page, appUrl, [
        pageEntry({ id: "duplicate-root", title: "Release plan" }),
        pageEntry({ id: "duplicate-existing-1", title: "Release plan (1)" }),
      ]);

      await duplicatePageFromSidebar(page, "duplicate-root");

      const pages = await workspacePages(page);
      const titles = pages.map((entry) => entry.title);

      expect(titles.filter((title) => title === "Release plan (1)").length).toBe(1);
      expect(titles.filter((title) => title === "Release plan (2)").length).toBe(1);
    },
  ),
  defineScenario(
    "34. Duplicate Title Numbering",
    "Subtree duplication",
    "duplicate numbering applies to the duplicated page while child pages clone under the new parent",
    async ({ page, appUrl }) => {
      await openFixture(page, appUrl, [
        pageEntry({ id: "duplicate-root", title: "Project docs" }),
        pageEntry({
          id: "duplicate-child",
          title: "Child notes",
          parentPageId: "duplicate-root",
        }),
      ]);

      await duplicatePageFromSidebar(page, "duplicate-root");

      const pages = await workspacePages(page);
      const duplicatedRoot = pages.find((entry) => entry.title === "Project docs (1)");
      const duplicatedChild = pages.find(
        (entry) =>
          entry.title === "Child notes" &&
          entry.parentPageId === duplicatedRoot?._id,
      );
      const originalRoot = pages.find((entry) => entry._id === "duplicate-root");
      const originalChild = pages.find((entry) => entry._id === "duplicate-child");

      expect(duplicatedRoot).toBeTruthy();
      expect(duplicatedChild).toBeTruthy();
      expect(originalRoot?.title).toBe("Project docs");
      expect(originalChild?.parentPageId).toBe("duplicate-root");
      expect(duplicatedChild?._id).not.toBe("duplicate-child");
      expect(duplicatedChild?.parentPageId).toBe(duplicatedRoot?._id);
    },
  ),
];
