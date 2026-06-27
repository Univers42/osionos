import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
await page.goto("https://localhost:4322", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.getByRole("button", { name: /Start free/i }).first().click();
await page.locator("#portal[open]").waitFor({ timeout: 15000 });
await page.locator('[data-auth-switch="login"]').click();
await page.getByRole("textbox", { name: "Email" }).fill("dylan@gmail.com");
await page.getByRole("textbox", { name: "Password" }).fill("Osionos123!");
await page.locator("#portal [data-login-submit]").click();
await page.waitForURL((u) => u.port === "3001", { timeout: 45000 });
await page.waitForTimeout(6000);
await page.getByRole("button", { name: /Delivery Wiki/i }).first().click();
await page.waitForTimeout(7000);
await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
await page.waitForTimeout(1000);
const out = await page.evaluate(() => {
  const html = document.documentElement;
  const card = document.querySelector(".notion-object-database [class*='bg-surface-primary']");
  const wrapper = document.querySelector(".osionos-object-database-single-view");
  const cs = card ? getComputedStyle(card) : null;
  const wcs = wrapper ? getComputedStyle(wrapper) : null;
  return {
    htmlData: { theme: html.dataset.theme, dbmsSource: html.dataset.dbmsSource ?? null },
    cardBg: cs?.backgroundColor ?? "no-card",
    cardVarAtCard: card ? getComputedStyle(card).getPropertyValue("--color-surface-primary").trim() : null,
    osioBgPageAtCard: card ? getComputedStyle(card).getPropertyValue("--osio-bg-page").trim() : null,
    wrapperClasses: wrapper?.className?.slice(0, 200) ?? "none",
    wrapperDataTheme: wrapper?.getAttribute("data-theme"),
    osioAtWrapper: wcs?.getPropertyValue("--osio-bg-page").trim(),
    sourcePill: Boolean(document.querySelector(".osionos-object-database-single-view .odb-topbar-actions")?.textContent?.includes("Source")),
    pillOutsideActions: [...document.querySelectorAll(".osionos-object-database-single-view button")].filter(b => b.textContent?.includes("Source")).length,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
