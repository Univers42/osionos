// A Markdown import whose page the server refuses (the WAF's 403, #286) toasts the readable reason
// (#287) and is not listed as a completed import.

import { expect, test } from "@playwright/test";

import { seedSession } from "../support/bridgeSession.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";
import { openSettings, region } from "../support/settingsHelpers.mjs";

const NGINX_403 = "BaaS request failed with 403: <html>\r\n<head><title>403 Forbidden</title></head>\r\n<body>\r\n<center><h1>403 Forbidden</h1></center>\r\n<hr><center>nginx/1.28.2</center>\r\n</body>\r\n</html>";

test("a refused page create is toasted readably and not counted as completed", async ({ page, baseURL }) => {
  await stubBridge(page, (url, request) => {
    if (url.pathname === "/api/pages" && request.method() === "POST") return { status: 403, json: { ok: false, message: NGINX_403 } };
    if (url.pathname === "/api/pages/all") return { json: [] };
    if (url.pathname === "/api/object-databases") return { json: { databases: [] } };
    // Settings reads several lists (passkeys, sessions...): an empty list keeps every panel quiet.
    return { json: request.method() === "GET" ? [] : {} };
  });
  await seedSession(page, {});
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await openSettings(page, "Import");
  await region(page).locator('input[type="file"]').setInputFiles({ name: "java-notes.md", mimeType: "text/markdown", buffer: Buffer.from("# Java notes\n\nUse java.lang.String.\n") });
  await expect(page.getByText("The server's request filter refused this request (403).")).toBeVisible();
  await expect(page.getByText(/nginx|<html/)).toHaveCount(0);
  await region(page).getByRole("tab", { name: /Completed/ }).click();
  await expect(region(page).getByText("java-notes.md")).toHaveCount(0);
});
