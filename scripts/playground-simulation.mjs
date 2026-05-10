#!/usr/bin/env node
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const websiteUrl = process.env.PLAYGROUND_WEBSITE_URL ?? 'http://127.0.0.1:4322';
const appUrl = process.env.PLAYGROUND_APP_URL ?? 'http://127.0.0.1:3001';
const appOrigin = new URL(appUrl);
const headless = process.env.PLAYGROUND_HEADLESS !== '0';
const slowMo = Number.parseInt(process.env.PLAYGROUND_SLOWMO_MS ?? '80', 10);
const stamp = new Date().toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14);
const username = (process.env.PLAYGROUND_USERNAME ?? `playground${stamp}`).toLowerCase();
const email = process.env.PLAYGROUND_EMAIL ?? `${username}@example.com`;
const password = process.env.PLAYGROUND_PASSWORD ?? `Pg${stamp}${randomBytes(4).toString('hex')}!Aa1`;
const viewerDir = process.env.PLAYGROUND_VIEWER_DIR ?? fileURLToPath(new URL('../public/playground-simulation/', import.meta.url));
const viewerStatePath = `${viewerDir}/state.json`;
const viewerSnapshotPath = `${viewerDir}/snapshot.png`;
const logEntries = [];
let snapshotVersion = null;
let page;

function logStep(message) {
  console.log(`[playground] ${message}`);
  logEntries.push({
    time: new Date().toLocaleTimeString('en-US', { hour12: false }),
    message,
  });
}

async function publishState(status, message, extra = {}) {
  await mkdir(viewerDir, { recursive: true });
  if (page && !page.isClosed()) {
    const nextSnapshotVersion = String(Date.now());
    const captured = await page.screenshot({ path: viewerSnapshotPath }).then(() => true).catch(() => false);
    if (captured) {
      snapshotVersion = nextSnapshotVersion;
    }
  }
  await writeFile(viewerStatePath, JSON.stringify({
    status,
    message,
    updatedAt: new Date().toISOString(),
    username,
    email,
    currentUrl: page && !page.isClosed() ? page.url() : null,
    snapshotVersion,
    log: logEntries,
    ...extra,
  }, null, 2));
}

async function step(message, status = 'running', extra = {}) {
  logStep(message);
  await publishState(status, message, extra);
}

async function fillByRole(page, name, value) {
  const field = page.getByRole('textbox', { name, exact: true });
  await field.fill(value);
}

const browser = await chromium.launch({ headless, slowMo: Number.isFinite(slowMo) ? slowMo : 0 });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
page = await context.newPage();

try {
  await step('Simulation starting. This viewer mirrors the Docker Playwright browser with live screenshots.');
  await step(`Opening website: ${websiteUrl}`);
  await page.goto(websiteUrl, { waitUntil: 'domcontentloaded' });
  await publishState('running', 'Website loaded. Opening the account portal.');

  await step('Opening account portal');
  await page.getByRole('button', { name: /Start free/i }).first().click();
  await page.locator('#portal[open]').waitFor();
  await page.locator('[data-auth-title]', { hasText: /Create your workspace/i }).waitFor();
  await publishState('running', 'Account portal is open.');

  await step(`Creating development account: ${email}`);
  await fillByRole(page, 'Username', username);
  await fillByRole(page, 'Email', email);
  await fillByRole(page, 'Password', password);
  await fillByRole(page, 'Repeat password', password);
  await page.getByRole('checkbox', { name: /I have read and accept/i }).check();
  await publishState('running', 'Registration form is filled. Creating the account.');
  await page.getByRole('button', { name: /Create protected account/i }).click();
  await page.getByText(/Development account created|Account created/i).first().waitFor({ timeout: 30_000 });
  await publishState('running', 'Development account created. Switching to sign in.');

  await step('Signing in and requesting osionos bridge session');
  await page.locator('[data-auth-switch="login"]').click();
  await page.locator('[data-auth-title]', { hasText: /Open your workspace/i }).waitFor();
  await publishState('running', 'Sign-in mode is ready. Requesting bridge session.');
  await page.locator('#portal [data-login-submit]').click();

  await step('Waiting for osionos to consume the bridge token');
  await page.waitForURL((url) => url.port === appOrigin.port && url.hash.includes('source=adapter'), { timeout: 45_000 });
  await page.getByRole('button', { name: new RegExp(`${username}'s osionos`, 'i') }).waitFor({ timeout: 30_000 });

  const session = await page.evaluate(() => {
    const bridge = JSON.parse(localStorage.getItem('osionos:bridge-session') || 'null');
    return {
      url: location.href,
      hasBridgeSession: Boolean(bridge),
      bridgePersona: bridge?.persona?.name ?? null,
      workspace: bridge?.session?.privateWorkspaces?.[0]?.name ?? null,
      accessTokenPrefix: bridge?.session?.accessToken?.slice(0, 11) ?? null,
    };
  });

  if (!session.hasBridgeSession || session.bridgePersona !== username || session.workspace !== `${username}'s osionos`) {
    throw new Error(`Unexpected osionos session: ${JSON.stringify(session)}`);
  }

  await step('Classic website to osionos flow succeeded.', 'succeeded', { session });
  console.log(JSON.stringify(session, null, 2));
} catch (error) {
  const screenshot = '/app/test-results/playground-simulation-failure.png';
  const message = `Simulation failed: ${error instanceof Error ? error.message : 'unknown error'}`;
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  await publishState('failed', message, { error: message, failureScreenshot: screenshot }).catch(() => {});
  console.error(`[playground] ${message}`);
  console.error(`[playground] Failure screenshot: ${screenshot}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
