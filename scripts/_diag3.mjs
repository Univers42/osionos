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
const board = page.locator(".osionos-object-database-single-view").nth(1);
await board.scrollIntoViewIfNeeded();
await board.hover();
await page.waitForTimeout(900);
const out = await page.evaluate(() => {
  const pills = [...document.querySelectorAll("button")].filter(b => b.textContent?.trim().startsWith("Source") || b.textContent?.includes("Source"));
  return pills.map(b => {
    const r = b.getBoundingClientRect();
    const chain = [];
    let el = b.parentElement;
    for (let i = 0; i < 6 && el; i += 1) { chain.push(el.className?.toString().slice(0, 60)); el = el.parentElement; }
    return { text: b.textContent?.trim().slice(0, 30), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }, visible: r.width > 0 && getComputedStyle(b).opacity !== "0", chain };
  });
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
