/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   imageDescribe.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// "Describe with AI" on an image block, in a browser (#75): the M7 sheet listed the toolbar
// button, the chips and the alt-text offer as never exercised outside unit tests. The AI
// service is the stub host of PLAYWRIGHT_AI_STUB; the picture is an upload path of the one
// shape the service serves (assistantHandoff.ts MEDIA_PATH), answered here.

import { expect, test } from "@playwright/test";

import { createBlockViaSlash, embedMediaViaLink, openFreshPage } from "../../browser/core/app.mjs";

const UPLOAD = `/api/media/uploads/0b5f3c3e-6a1d-4c8e-9f57-2d9a1c4e7b10/${"a".repeat(64)}.svg`;
const PICTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240">
  <rect width="480" height="240" fill="#bfe3f5"/><circle cx="380" cy="60" r="32" fill="#f7c948"/>
  <path d="M0 240 L140 90 L260 240 Z" fill="#5b7b5a"/><path d="M160 240 L310 70 L480 240 Z" fill="#3f5d45"/>
</svg>`;
const ANSWER = {
  caption: "Two green mountains under a yellow sun",
  tags: ["mountain", "sun", "landscape"],
  objects: ["mountain"],
  ocr: "",
};

/** Serves the picture and answers the AI host; returns the bodies POSTed to /media/describe. */
async function stubService(page, describe = { status: 200, body: ANSWER }) {
  const asked = [];
  await page.route(`**${UPLOAD}`, (route) => route.fulfill({ contentType: "image/svg+xml", body: PICTURE }));
  await page.route("https://ai.invalid/**", (route) => {
    const request = route.request();
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/ai/media/describe") {
      asked.push(request.postDataJSON());
      return route.fulfill({ status: describe.status, json: describe.body });
    }
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  return asked;
}

/** The tag chips; the last item of the list is the "Add tag" field, not a chip. */
const chips = (media) => media.getByRole("list", { name: "Image tags" }).locator("li > span");

async function insertUploadedImage(page, baseURL) {
  await openFreshPage(page, baseURL);
  await createBlockViaSlash(page, "image", "Image");
  const media = page.getByTestId("media-block-editor");
  await media.getByRole("button", { name: /^Add image$/i }).click();
  await embedMediaViaLink(page, "image", UPLOAD);
  await expect(media.locator("img")).toBeVisible();
  return media;
}

test("Describe with AI writes the caption as alt text and shows editable tag chips", async ({ page, baseURL }, testInfo) => {
  const asked = await stubService(page);
  const media = await insertUploadedImage(page, baseURL);

  await media.hover();
  const describe = page.getByRole("toolbar", { name: "Image actions" }).getByRole("button", { name: "Describe with AI" });
  await describe.hover();
  await media.screenshot({ path: testInfo.outputPath("toolbar.png") });
  await describe.click();

  const tags = chips(media);
  await expect(tags).toHaveText(["mountain", "sun", "landscape"]);
  await expect(media.locator("img")).toHaveAttribute("alt", ANSWER.caption);
  // The service gets the upload path and nothing else: never the URL or the bytes (C80).
  expect(asked).toEqual([{ path: UPLOAD }]);

  await media.getByRole("button", { name: "Remove tag sun" }).click();
  await media.getByRole("textbox", { name: "Add tag" }).fill("Alps");
  await page.keyboard.press("Enter");
  await expect(tags).toHaveText(["mountain", "landscape", "alps"]);
  await media.screenshot({ path: testInfo.outputPath("described.png") });
});

test("an image that already has alt text gets the caption only as a suggestion", async ({ page, baseURL }, testInfo) => {
  await stubService(page);
  const media = await insertUploadedImage(page, baseURL);
  await media.hover();
  await page.getByRole("toolbar", { name: "Image actions" }).getByRole("button", { name: "Describe with AI" }).click();
  await expect(media.locator("img")).toHaveAttribute("alt", ANSWER.caption);

  await media.getByRole("textbox", { name: "Add tag" }).focus();
  await page.route("https://ai.invalid/api/ai/media/describe", (route) =>
    route.fulfill({ json: { ...ANSWER, caption: "A mountain range at noon" } }));
  await media.hover();
  await page.getByRole("toolbar", { name: "Image actions" }).getByRole("button", { name: "Describe with AI" }).click();

  await expect(media.getByText("Suggested alt text: “A mountain range at noon”")).toBeVisible();
  await media.screenshot({ path: testInfo.outputPath("suggested.png") });
  await expect(media.locator("img")).toHaveAttribute("alt", ANSWER.caption);
  await media.getByRole("button", { name: "Replace alt text" }).click();
  await expect(media.locator("img")).toHaveAttribute("alt", "A mountain range at noon");
});

test("a service with the feature off hides the action for the session", async ({ page, baseURL }) => {
  await stubService(page, { status: 404, body: { error: { code: "not_found" } } });
  const media = await insertUploadedImage(page, baseURL);
  const toolbar = page.getByRole("toolbar", { name: "Image actions" });
  await media.hover();
  await toolbar.getByRole("button", { name: "Describe with AI" }).click();

  await media.hover();
  await expect(toolbar.getByRole("button", { name: "Caption" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Describe with AI" })).toHaveCount(0);
  await expect(chips(media)).toHaveCount(0);
});
