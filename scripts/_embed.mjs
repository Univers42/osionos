import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

async function login(theme) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
  await page.goto("https://localhost:4322", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: /Start free/i }).first().click();
  await page.locator("#portal[open]").waitFor({ timeout: 15000 });
  await page.locator('[data-auth-switch="login"]').click();
  await page.getByRole("textbox", { name: "Email" }).fill("dylan@gmail.com");
  await page.getByRole("textbox", { name: "Password" }).fill("Osionos123!");
  await page.locator("#portal [data-login-submit]").click();
  await page.waitForURL((u) => u.port === "3001", { timeout: 45000 });
  await page.waitForFunction(() => Boolean(localStorage.getItem("osionos:bridge-session")), null, { timeout: 45000 });
  await page.waitForTimeout(5000);
  return page;
}

for (const theme of ["light", "dark"]) {
  const page = await login(theme);
  await page.getByRole("button", { name: /Delivery Wiki/i }).first().click();
  await page.waitForTimeout(7000);
  // scroll to the first embed (status board area)
  await page.mouse.move(880, 500);
  await page.mouse.wheel(0, 1100);
  await page.waitForTimeout(2500);
  await page.mouse.move(60, 500); // pointer OFF the embed → at-rest state
  await page.waitForTimeout(800);
  await page.screenshot({ path: `/app/test-results/embed-${theme}-rest.png` });
  const block = page.locator(".osionos-object-database-single-view").nth(1);
  await block.hover();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `/app/test-results/embed-${theme}-hover.png` });
  await page.close();
  console.log(`${theme} done`);
}
// full-page database keeps full chrome: open mysql-ops Tasks
const page = await login("light");
await page.getByRole("button", { name: /Live Databases/i }).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /mysql-ops/i }).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /tasks/i }).first().click();
await page.waitForTimeout(7000);
await page.screenshot({ path: "/app/test-results/embed-fullpage.png" });
console.log("fullpage done");
await browser.close();
