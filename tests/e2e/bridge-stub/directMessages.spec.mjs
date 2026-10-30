/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   directMessages.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #173: chat between two users, from the screens, against a stubbed bridge
// (PLAYWRIGHT_BRIDGE_STUB=1): Message on Bob's profile opens the DM, Bob's message
// from the server is shown, and what this user types is posted to that channel.
// Live delivery to the other client is the realtime path (#172), which this build
// has off; tests/bridge/bridge-realtime-*.test.mjs prove the server publishes.
// #177: a file attached in the DM shows its upload progress until the bridge answers.

import { expect, test } from "@playwright/test";

import { openSignedIn, stubBridge } from "../support/bridgeStub.mjs";
import { OTHER, answerProfileReads, heading, openProfileFromPalette } from "../support/profilePageMocks.mjs";

const DM = {
  id: "dm-bob", workspaceId: "ws-1", kind: "dm", name: "Bob Jones", topic: null,
  createdBy: OTHER.id, isPrivate: true, memberRole: "member", createdAt: "2026-10-30T09:00:00.000Z",
};

const fromBob = {
  id: "m-bob-1", channelId: DM.id, authorId: OTHER.id, authorName: "Bob Jones",
  content: "Are we still on for the review at three?", createdAt: "2026-10-30T09:05:00.000Z", reactions: [],
};

const draftOf = (url) => ({
  type: "file", bucket: "chat", objectKey: `${"b".repeat(64)}.pdf`, sha256: "b".repeat(64),
  name: url.searchParams.get("name"), mimeType: "application/pdf", size: 200_000, metadata: {},
});

/** The DM channel's messages, who the client opened a DM with, and every message it posted. */
async function stubDm(page) {
  let releaseUpload;
  const uploadAnswered = new Promise((resolve) => { releaseUpload = resolve; });
  const state = { messages: [fromBob], openedWith: [], posted: [], releaseUpload };
  await stubBridge(page, (url, request) => {
    const method = request.method();
    const profile = answerProfileReads(url);
    if (profile) return profile;
    if (url.pathname === "/api/chat/dm" && method === "POST") {
      state.openedWith.push(request.postDataJSON().peerUserId);
      return { json: { channel: DM } };
    }
    if (url.pathname === "/api/chat/channels" && method === "GET") return { json: { channels: [DM] } };
    if (url.pathname === "/api/chat/uploads" && method === "POST") return uploadAnswered.then(() => ({ status: 201, json: { ok: true, attachment: draftOf(url) } }));
    if (url.pathname !== `/api/chat/channels/${DM.id}/messages`) return undefined;
    if (method === "GET") return { json: { channelId: DM.id, workspaceId: DM.workspaceId, messages: state.messages } };
    if (method !== "POST") return undefined;
    const body = request.postDataJSON();
    state.posted.push(body.content);
    const sent = { ...fromBob, id: `m-me-${state.posted.length}`, authorId: "me", authorName: "Me", content: body.content, createdAt: new Date().toISOString() };
    state.messages.push(sent);
    return { status: 201, json: { message: sent } };
  });
  return state;
}

test.describe("direct messages (bridge stub)", () => {
  test("Message on a profile opens the DM with what the other person sent", async ({ page, baseURL }) => {
    const bridge = await stubDm(page);
    await openSignedIn(page, baseURL);
    await openProfileFromPalette(page, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();
    await page.getByRole("button", { name: "Message", exact: true }).click();
    await expect(page.getByText(fromBob.content)).toBeVisible();
    expect(bridge.openedWith).toEqual([OTHER.id]);
  });

  test("a message typed in the DM is sent to that channel and shown", async ({ page, baseURL }) => {
    const bridge = await stubDm(page);
    await openSignedIn(page, baseURL);
    await openProfileFromPalette(page, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();
    await page.getByRole("button", { name: "Message", exact: true }).click();
    const composer = page.getByPlaceholder(`Message #${DM.name}`);
    await composer.fill("Yes, see you at three.");
    await composer.press("Enter");
    await expect(page.getByText("Yes, see you at three.")).toBeVisible();
    await expect(composer).toHaveValue("");
    expect(bridge.posted).toEqual(["Yes, see you at three."]);
  });

  test("an attached file shows its upload progress until the bridge answers", async ({ page, baseURL }) => {
    const bridge = await stubDm(page);
    await openSignedIn(page, baseURL);
    await openProfileFromPalette(page, "Bob");
    await page.getByRole("button", { name: "Message", exact: true }).click();
    await expect(page.getByText(fromBob.content)).toBeVisible();

    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Attach file" }).click();
    await (await chooser).setFiles({ name: "plan.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(200_000, 1) });

    const bar = page.getByRole("progressbar", { name: "Uploading plan.pdf" });
    await expect(bar).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove attachment" })).toHaveCount(0);
    bridge.releaseUpload();
    await expect(bar).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove attachment" })).toBeVisible();
  });
});
