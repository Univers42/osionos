/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-database-verification.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Live-database E2E (playground-simulation's sibling): signs in as the SEEDED
 * demo account (dylan@gmail.com — `make seed-live-demo` must have run),
 * bridges into osionos, opens the seeded "Live Databases" pages and proves
 * the notion-database-sys live mode against the real engines:
 *   - pg-commerce/Orders renders rows from PostgreSQL (status enum chips)
 *   - the curated preset views (Pipeline board / Store Stats dashboard /
 *     Fulfillment timeline) are offered by the view switcher
 *   - mysql-ops/Tasks and mongo-activity/Events render their engines' rows
 * Run (root): docker compose --profile testing run --rm playground-simulation \
 *               node scripts/live-database-verification.mjs
 * Skips (exit 0, SKIPPED) when the stack or the seeded pages are missing so
 * offline suites stay green; LIVE_E2E_REQUIRED=1 turns skips into failures.
 */

import { chromium } from 'playwright';

const websiteUrl = process.env.PLAYGROUND_WEBSITE_URL ?? 'https://127.0.0.1:4322';
const appOrigin = new URL(process.env.PLAYGROUND_APP_URL ?? 'https://127.0.0.1:3001');
const email = process.env.LIVE_E2E_EMAIL ?? 'dylan@gmail.com';
const password = process.env.LIVE_E2E_PASSWORD ?? 'Osionos123!';
const headless = (process.env.PLAYGROUND_HEADLESS ?? '1') !== '0';
const required = process.env.LIVE_E2E_REQUIRED === '1';

const log = (message) => console.log(`[live-e2e] ${message}`);
function skip(reason) {
  if (required) {
    console.error(`[live-e2e] FAIL (required): ${reason}`);
    process.exit(1);
  }
  log(`SKIPPED: ${reason}`);
  process.exit(0);
}

// Stack-up guard: offline runs must not fail.
try {
  const probe = await fetch(websiteUrl, { method: 'HEAD' });
  if (!probe.ok && probe.status >= 500) skip(`website ${websiteUrl} unhealthy (${probe.status})`);
} catch {
  skip(`website ${websiteUrl} unreachable — is the stack up?`);
}

const browser = await chromium.launch({ headless });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 980 } });
const page = await context.newPage();
let failed = false;

try {
  log(`signing in as ${email} at ${websiteUrl}`);
  await page.goto(websiteUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Start free/i }).first().click();
  await page.locator('#portal[open]').waitFor();
  await page.locator('[data-auth-switch="login"]').click();
  await page.locator('[data-auth-title]', { hasText: /Open your workspace/i }).waitFor();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.locator('#portal [data-login-submit]').click();

  log('waiting for the osionos bridge handoff');
  await page.waitForURL((url) => url.port === appOrigin.port, { timeout: 45_000 });
  await page.waitForFunction(() => Boolean(localStorage.getItem('osionos:bridge-session')), null, { timeout: 45_000 });
  log(`bridged into osionos at ${page.url()}`);

  log('opening the seeded Live Databases → pg-commerce → Orders page');
  const sidebarButton = (name) => page.getByRole('button', { name, exact: false }).first();
  await sidebarButton('Live Databases').waitFor({ timeout: 30_000 }).catch(() => skip(
    'the "Live Databases" page tree is not in this workspace — run `make seed-live-demo`',
  ));
  await sidebarButton('Live Databases').click();
  await sidebarButton('pg-commerce').click();
  await sidebarButton('Orders').click();

  log('asserting PostgreSQL rows render (status enum values visible)');
  await page.getByText(/delivered/i).first().waitFor({ timeout: 30_000 });
  const statusChips = await page.getByText(/^(delivered|shipped|pending|paid|cancelled|refunded)$/).count();
  if (statusChips < 3) throw new Error(`expected several order-status cells, saw ${statusChips}`);
  log(`orders view shows live rows (${statusChips} status cells in the viewport)`);

  log('asserting the curated commerce preset views are offered');
  for (const viewName of ['Pipeline', 'Store Stats', 'Fulfillment']) {
    const tab = page.getByText(viewName, { exact: true }).first();
    await tab.waitFor({ timeout: 15_000 }).catch(() => {
      throw new Error(`preset view "${viewName}" is not offered by the view switcher`);
    });
  }
  log('preset views present: Pipeline (board), Store Stats (dashboard), Fulfillment (timeline)');

  log('switching to the Pipeline board (groups by the status enum)');
  await page.getByText('Pipeline', { exact: true }).first().click();
  await page.getByText(/delivered/i).first().waitFor({ timeout: 20_000 });

  log('opening mysql-ops → Tasks (MySQL rows + ENUM columns)');
  await sidebarButton('mysql-ops').click();
  await sidebarButton('Tasks').click();
  await page.getByText(/^(todo|in_progress|review|blocked|done)$/).first().waitFor({ timeout: 30_000 });

  log('opening mongo-activity → Events (MongoDB rows via $jsonSchema contract)');
  await sidebarButton('mongo-activity').click();
  await sidebarButton('Events').click();
  await page.getByText(/page_view|checkout|add_to_cart/i).first().waitFor({ timeout: 30_000 });

  await page.screenshot({ path: '/app/test-results/live-database-verification.png', fullPage: true }).catch(() => {});
  log('OK — live database mode verified end-to-end as dylan@gmail.com (pg + mysql + mongo)');
} catch (error) {
  failed = true;
  const message = error instanceof Error ? error.message : String(error);
  await page.screenshot({ path: '/app/test-results/live-database-verification-failure.png', fullPage: true }).catch(() => {});
  console.error(`[live-e2e] FAIL: ${message}`);
  console.error('[live-e2e] screenshot: /app/test-results/live-database-verification-failure.png');
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
