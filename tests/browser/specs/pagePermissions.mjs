/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pagePermissions.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: codex <codex@openai.com>                   +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/29 00:00:00 by codex             #+#    #+#             */
/*   Updated: 2026/04/29 00:00:00 by codex            ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  movePageItem,
  movePageModal,
  openSidebarPageOptions,
  primeLocalState,
  readPagesCache,
  sidebarPageRow,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

function blockParagraph(id, content) {
  return {
    id,
    type: "paragraph",
    content,
  };
}

function pageEntry({
  id,
  title,
  workspaceId,
  ownerId,
  visibility,
}) {
  return {
    _id: id,
    title,
    workspaceId,
    ownerId,
    visibility,
    collaborators: [],
    parentPageId: null,
    databaseId: null,
    archivedAt: null,
    content: [blockParagraph(`${id}-p`, title)],
  };
}

function teamPagesFixture() {
  return {
    "mock-ws-private-0": [],
    "mock-ws-private-1": [],
    "mock-ws-shared-team": [
      pageEntry({
        id: "team-shared",
        title: "Shared Spec Page",
        workspaceId: "mock-ws-shared-team",
        ownerId: "mock-user-0",
        visibility: "shared",
      }),
      pageEntry({
        id: "team-private",
        title: "Private Spec Page",
        workspaceId: "mock-ws-shared-team",
        ownerId: "mock-user-0",
        visibility: "private",
      }),
    ],
  };
}

function ownerSharedOnlyFixture() {
  return {
    "mock-ws-private-0": [],
    "mock-ws-shared-team": [
      pageEntry({
        id: "team-shared",
        title: "Shared Spec Page",
        workspaceId: "mock-ws-shared-team",
        ownerId: "mock-user-0",
        visibility: "shared",
      }),
    ],
  };
}

async function openAsAlexInTeamWorkspace(page) {
  await primeLocalState(page, {
    activeUserId: "mock-user-1",
    activeWorkspaceByUser: {
      "mock-user-1": "mock-ws-shared-team",
    },
    pages: teamPagesFixture(),
  });
}

async function openAsDylanInTeamWorkspace(page) {
  await primeLocalState(page, {
    activeUserId: "mock-user-0",
    activeWorkspaceByUser: {
      "mock-user-0": "mock-ws-shared-team",
    },
    pages: teamPagesFixture(),
  });
}

export const pagePermissionsScenarios = [
  defineScenario(
    "32. Page Permissions ABAC",
    "Sidebar visibility",
    "shared pages stay visible to workspace members while private team pages stay hidden from non-owners",
    async ({ page, appUrl }) => {
      await openAsAlexInTeamWorkspace(page);
      await page.goto(appUrl, { waitUntil: "networkidle" });

      await expect(sidebarPageRow(page, "team-shared")).toBeVisible();
      await expect(
        sidebarPageRow(page, "team-shared").getByTestId("page-visibility-badge"),
      ).toHaveText("Shared");
      await expect(sidebarPageRow(page, "team-private")).toHaveCount(0);
    },
  ),
  defineScenario(
    "32. Page Permissions ABAC",
    "Sidebar visibility",
    "page owner sees both private and shared entries with explicit status badges",
    async ({ page, appUrl }) => {
      await openAsDylanInTeamWorkspace(page);
      await page.goto(appUrl, { waitUntil: "networkidle" });

      await expect(sidebarPageRow(page, "team-shared")).toBeVisible();
      await expect(sidebarPageRow(page, "team-private")).toBeVisible();
      await expect(
        sidebarPageRow(page, "team-private").getByTestId("page-visibility-badge"),
      ).toHaveText("Private");
    },
  ),
  defineScenario(
    "32. Page Permissions ABAC",
    "Move modal restrictions",
    "non-owners keep Duplicate but cannot see private workspaces as move destinations",
    async ({ page, appUrl }) => {
      await openAsAlexInTeamWorkspace(page);
      await page.goto(appUrl, { waitUntil: "networkidle" });

      await openSidebarPageOptions(page, "team-shared");
      await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
      await page.getByRole("button", { name: "Move to" }).click();

      await expect(movePageModal(page)).toBeVisible();
      await expect(
        movePageItem(page, {
          workspaceId: "mock-ws-private-1",
          targetType: "root",
        }),
      ).toHaveCount(0);
      await expect(
        movePageItem(page, {
          workspaceId: "mock-ws-shared-team",
          targetType: "root",
          title: "Team Workspace Root",
        }),
      ).toHaveCount(1);
    },
  ),
  defineScenario(
    "32. Page Permissions ABAC",
    "Duplicate fallback",
    "non-owners can duplicate shared pages into an owned shared copy",
    async ({ page, appUrl }) => {
      await openAsAlexInTeamWorkspace(page);
      await page.goto(appUrl, { waitUntil: "networkidle" });

      await openSidebarPageOptions(page, "team-shared");
      await page.getByRole("button", { name: "Duplicate" }).click();

      await expect(
        page.getByTestId("sidebar-page-row").filter({
          hasText: /Shared Spec Page \(1\)/,
        }),
      ).toHaveCount(1);

      const pages = await readPagesCache(page);
      const duplicate = (pages["mock-ws-shared-team"] ?? []).find(
        (entry) => entry.title === "Shared Spec Page (1)",
      );

      expect(duplicate).toBeTruthy();
      expect(duplicate.ownerId).toBe("mock-user-1");
      expect(duplicate.visibility).toBe("shared");
    },
  ),
  defineScenario(
    "32. Page Permissions ABAC",
    "Owner move rights",
    "owner can move a shared page into a private workspace and it becomes private there",
    async ({ page, appUrl }) => {
      await primeLocalState(page, {
        activeUserId: "mock-user-0",
        activeWorkspaceByUser: {
          "mock-user-0": "mock-ws-shared-team",
        },
        pages: ownerSharedOnlyFixture(),
      });
      await page.goto(appUrl, { waitUntil: "networkidle" });

      await openSidebarPageOptions(page, "team-shared");
      await page.getByRole("button", { name: "Move to" }).click();
      await movePageItem(page, {
        workspaceId: "mock-ws-private-0",
        targetType: "root",
        title: "Dylan Admin's workspace Root",
      }).click();

      await expect(sidebarPageRow(page, "team-shared")).toHaveCount(0);

      const pages = await readPagesCache(page);
      const teamPages = pages["mock-ws-shared-team"] ?? [];
      const privatePages = pages["mock-ws-private-0"] ?? [];
      const moved = privatePages.find((entry) => entry._id === "team-shared");

      expect(teamPages.find((entry) => entry._id === "team-shared")).toBeFalsy();
      expect(moved).toBeTruthy();
      expect(moved.workspaceId).toBe("mock-ws-private-0");
      expect(moved.visibility).toBe("private");
    },
  ),
];
