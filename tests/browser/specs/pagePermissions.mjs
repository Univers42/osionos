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
  sidebarPageButton,
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

const SHARED_TITLE = "Roadmap Alpha";
const PRIVATE_TITLE = "Ops Notes";

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
        title: SHARED_TITLE,
        workspaceId: "mock-ws-shared-team",
        ownerId: "mock-user-0",
        visibility: "shared",
      }),
      pageEntry({
        id: "team-private",
        title: PRIVATE_TITLE,
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
        title: SHARED_TITLE,
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

      await expect(sidebarPageButton(page, SHARED_TITLE)).toBeVisible();
      await expect(sidebarPageRow(page, SHARED_TITLE)).toContainText("Shared");
      await expect(sidebarPageButton(page, PRIVATE_TITLE)).toHaveCount(0);
    },
  ),
  defineScenario(
    "32. Page Permissions ABAC",
    "Sidebar visibility",
    "page owner sees both private and shared entries with explicit status badges",
    async ({ page, appUrl }) => {
      await openAsDylanInTeamWorkspace(page);
      await page.goto(appUrl, { waitUntil: "networkidle" });

      await expect(sidebarPageButton(page, SHARED_TITLE)).toBeVisible();
      await expect(sidebarPageButton(page, PRIVATE_TITLE)).toBeVisible();
      await expect(sidebarPageRow(page, PRIVATE_TITLE)).toContainText("Private");
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
          title: "Move to Alex Collaborator's workspace Root",
        }),
      ).toHaveCount(0);
      await expect(
        movePageItem(page, {
          title: "Move to Team Workspace Root",
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

      await expect(sidebarPageButton(page, `${SHARED_TITLE} (1)`)).toHaveCount(1);

      const pages = await readPagesCache(page);
      const duplicate = (pages["mock-ws-shared-team"] ?? []).find(
        (entry) => entry.title === `${SHARED_TITLE} (1)`,
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
        title: "Move to Dylan Admin's workspace Root",
      }).click();

      await expect(sidebarPageButton(page, SHARED_TITLE)).toHaveCount(0);

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
