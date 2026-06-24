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
await page.waitForTimeout(1200);
const out = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".notion-object-database .group\\/card, .notion-object-database [class*='group/card']")];
  const card = cards[0];
  const pills = [...document.querySelectorAll(".osionos-object-database-single-view button")]
    .filter(b => b.textContent?.includes("Source")).map(b => ({
      html: b.outerHTML.slice(0, 160),
      inTopbar: Boolean(b.closest(".odb-topbar")),
    }));
  return {
    cardCount: cards.length,
    cardBg: card ? getComputedStyle(card).backgroundColor : "none",
    cardClass: card?.className?.slice(0, 120),
    pills,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
