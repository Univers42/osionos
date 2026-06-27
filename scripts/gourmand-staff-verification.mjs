/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   gourmand-staff-verification.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Vite & Gourmand staff E2E (live-database-verification's sibling): signs
 * into osionos as a MIRRORED staff member (credentials from
 * tools/seeds/.gourmand-people.env), switches to the "Vite & Gourmand" org
 * workspace and proves the client dashboards over their REAL database:
 *   - Restaurant HQ → Operations → Orders renders live "Order" rows
 *   - the curated preset views (Order Pipeline / Delivery Calendar /
 *     Revenue) are offered
 *   - Staff → Opening Hours renders the WorkingHours the website serves
 * Skips (exit 0) when the stack or the seeds are missing;
 * LIVE_E2E_REQUIRED=1 turns skips into failures.
 *
 * Run (root): docker compose --profile testing run --rm playground-simulation \
 *               node scripts/gourmand-staff-verification.mjs
 */

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const websiteUrl = process.env.PLAYGROUND_WEBSITE_URL ?? 'https://127.0.0.1:4322';
const appOrigin = new URL(process.env.PLAYGROUND_APP_URL ?? 'https://127.0.0.1:3001');
const required = process.env.LIVE_E2E_REQUIRED === '1';
const headless = (process.env.PLAYGROUND_HEADLESS ?? '1') !== '0';
const peopleEnvPath = process.env.GOURMAND_PEOPLE_ENV ?? '/repo/tools/seeds/.gourmand-people.env';

const log = (message) => console.log(`[gourmand-e2e] ${message}`);
function skip(reason) {
  if (required) {
    console.error(`[gourmand-e2e] FAIL (required): ${reason}`);
    process.exit(1);
  }
  log(`SKIPPED: ${reason}`);
  process.exit(0);
}

// Credentials of the mirrored OWNER (first cred line marked ws_role=owner).
let email = process.env.GOURMAND_E2E_EMAIL ?? '';
let password = process.env.GOURMAND_E2E_PASSWORD ?? '';
if (!email || !password) {
  try {
    const lines = readFileSync(peopleEnvPath, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.startsWith('GOURMAND_CRED_')) continue;
      const [credEmail, , , wsRole, credPassword] = line.split('=', 2)[1].split('|');
      if (wsRole === 'owner') {
        email = credEmail;
        password = credPassword;
        break;
      }
    }
  } catch {
    skip(`no staff credentials (${peopleEnvPath} unreadable — run make gourmand-people)`);
  }
}
if (!email || !password) skip('no owner credentials in the people env');

try {
  const probe = await fetch(websiteUrl, { method: 'HEAD' });
  if (!probe.ok && probe.status >= 500) skip(`website unhealthy (${probe.status})`);
} catch {
  skip(`website ${websiteUrl} unreachable — is the stack up?`);
}

const browser = await chromium.launch({ headless });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1500, height: 980 } });
const page = await context.newPage();
let failed = false;

try {
  log(`signing in as the mirrored staff owner ${email}`);
  await page.goto(websiteUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Start free/i }).first().click();
  await page.locator('#portal[open]').waitFor();
  await page.locator('[data-auth-switch="login"]').click();
  await page.locator('[data-auth-title]', { hasText: /Open your workspace/i }).waitFor();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.locator('#portal [data-login-submit]').click();
  await page.waitForURL((url) => url.port === appOrigin.port, { timeout: 45_000 });
  await page.waitForFunction(() => Boolean(localStorage.getItem('osionos:bridge-session')), null, { timeout: 45_000 });
  log('bridged into osionos');

  log('switching to the "Vite & Gourmand" org workspace');
  const switcher = page.getByRole('button', { name: /osionos|workspace/i }).first();
  await switcher.click().catch(() => {});
  const orgEntry = page.getByText('Vite & Gourmand', { exact: false }).first();
  await orgEntry.waitFor({ timeout: 20_000 }).catch(() => skip(
    'the org workspace is not in the switcher — run make gourmand-people && gourmand-content',
  ));
  await orgEntry.click();

  log('opening Restaurant HQ → Operations → Orders');
  const sidebarButton = (name) => page.getByRole('button', { name, exact: false }).first();
  await sidebarButton('Restaurant HQ').waitFor({ timeout: 30_000 });
  await sidebarButton('Restaurant HQ').click();
  await sidebarButton('Operations').click();
  await sidebarButton('Orders').click();

  log('asserting live "Order" rows render');
  await page.getByText(
    /pending|accepted|preparing|delivering|delivered|completed|cancelled|awaiting_material_return/i,
  ).first().waitFor({ timeout: 45_000 });
  for (const viewName of ['Order Pipeline', 'Revenue', 'Delivery Calendar']) {
    await page.getByText(viewName, { exact: true }).first().waitFor({ timeout: 15_000 }).catch(() => {
      throw new Error(`preset view "${viewName}" missing from the view switcher`);
    });
  }
  log('preset views present (Pipeline board / Revenue dashboard / Delivery calendar)');

  log('opening Staff → Opening Hours (the table the website serves)');
  await sidebarButton('Staff').click();
  await sidebarButton('Opening Hours').click();
  await page.getByText(/\d{2}:\d{2}/).first().waitFor({ timeout: 30_000 });

  await page.screenshot({ path: '/app/test-results/gourmand-staff-verification.png', fullPage: true }).catch(() => {});
  log(`OK — ${email} works the restaurant's live data through the org workspace`);
} catch (error) {
  failed = true;
  const message = error instanceof Error ? error.message : String(error);
  await page.screenshot({ path: '/app/test-results/gourmand-staff-verification-failure.png', fullPage: true }).catch(() => {});
  console.error(`[gourmand-e2e] FAIL: ${message}`);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
