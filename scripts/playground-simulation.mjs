/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   playground-simulation.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

#!/usr/bin/env node
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const websiteUrl = process.env.PLAYGROUND_WEBSITE_URL ?? 'https://127.0.0.1:4322';
const appUrl = process.env.PLAYGROUND_APP_URL ?? 'https://127.0.0.1:3001';
const bridgeUrl = process.env.PLAYGROUND_BRIDGE_URL ?? 'https://127.0.0.1:4000';
const mailUrl = process.env.PLAYGROUND_MAIL_URL ?? 'https://127.0.0.1:3002';
const mailBridgeUrl = process.env.PLAYGROUND_MAIL_BRIDGE_URL ?? 'https://127.0.0.1:4100';
const calendarUrl = process.env.PLAYGROUND_CALENDAR_URL ?? 'https://127.0.0.1:3003';
const calendarBridgeUrl = process.env.PLAYGROUND_CALENDAR_BRIDGE_URL ?? 'https://127.0.0.1:4200';
const requireExternalSync = process.env.PLAYGROUND_REQUIRE_EXTERNAL_SYNC === '1';
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, (match) => String.raw`\${match}`);
}

async function readJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : `${url} returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function authHeaders(accessToken) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

function blockId(prefix) {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
}

async function createPersistedMarkdownPage({ accessToken, workspaceId }) {
  const title = `Docker pipeline markdown ${stamp}`;
  const content = [
    { id: blockId('heading'), type: 'heading_2', content: 'Docker Playwright persistence check' },
    { id: blockId('paragraph'), type: 'paragraph', content: 'Persisted from Docker Playwright through the osionos bridge API.' },
    { id: blockId('todo'), type: 'to_do', content: 'Verify this page survives a reload', checked: true },
    { id: blockId('code'), type: 'code', content: 'make all\nmake playground', language: 'bash' },
  ];
  const created = await readJson(`${bridgeUrl}/api/pages`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      workspaceId,
      title,
      icon: 'icon:markdown',
      content,
      visibility: 'private',
    }),
  });
  const loaded = await readJson(`${bridgeUrl}/api/pages/${created._id}`, {
    headers: authHeaders(accessToken),
  });
  if (loaded.title !== title || !Array.isArray(loaded.content) || loaded.content.length < content.length) {
    throw new Error('Persisted page could not be read back from the osionos bridge API.');
  }
  return { pageId: created._id, title, blockCount: loaded.content.length };
}

async function probeMailBridge() {
  const session = await readJson(`${mailBridgeUrl}/session`);
  const result = {
    configured: Boolean(session.configured),
    connected: Boolean(session.connected),
    accountPresent: Boolean(session.account),
    fetchedCount: null,
  };
  if (!result.configured) throw new Error('Gmail bridge is reachable but OAuth credentials are not configured.');
  if (!result.connected) {
    if (requireExternalSync) throw new Error('Gmail bridge is configured but no Gmail account is connected yet.');
    return result;
  }
  const messages = await readJson(`${mailBridgeUrl}/messages?limit=5&paged=true`);
  result.fetchedCount = Number(messages.fetchedCount ?? messages.messages?.length ?? 0);
  return result;
}

async function probeCalendarBridge() {
  const session = await readJson(`${calendarBridgeUrl}/session`);
  const result = {
    configured: Boolean(session.configured),
    connected: Boolean(session.connected),
    accountPresent: Boolean(session.account),
    baasConnected: Boolean(session.baas?.connected),
    fetchedCount: null,
  };
  if (!result.configured) throw new Error('Google Calendar bridge is reachable but OAuth credentials are not configured.');
  if (!result.baasConnected) throw new Error('Google Calendar bridge cannot reach the BaaS gateway.');
  if (!result.connected) {
    if (requireExternalSync) throw new Error('Google Calendar bridge is configured but no Google Calendar account is connected yet.');
    return result;
  }
  const now = new Date();
  const later = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({ timeMin: now.toISOString(), timeMax: later.toISOString() });
  const events = await readJson(`${calendarBridgeUrl}/events?${params}`);
  result.fetchedCount = Number(events.events?.length ?? 0);
  result.baasConnected = Boolean(events.baas?.connected ?? result.baasConnected);
  return result;
}

async function openSidebarApp(label, expectedUrl) {
  const expected = new URL(expectedUrl);
  const currentUrl = page.url();
  const popupPromise = page.waitForEvent('popup', { timeout: 10_000 }).catch(() => null);
  await page.getByRole('button', { name: label, exact: true }).click();
  const openedPage = await popupPromise;
  if (openedPage) {
    await openedPage.waitForLoadState('domcontentloaded');
    const opened = new URL(openedPage.url());
    if (opened.port !== expected.port) {
      throw new Error(`${label} opened ${openedPage.url()} instead of ${expectedUrl}`);
    }
    await openedPage.close();
    return;
  }
  await page.waitForURL((url) => url.href !== currentUrl, { timeout: 10_000 });
  const opened = new URL(page.url());
  if (opened.port !== expected.port) {
    throw new Error(`${label} opened ${page.url()} instead of ${expectedUrl}`);
  }
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: new RegExp(escapeRegExp(`${username}'s osionos`), 'i') }).waitFor({ timeout: 30_000 });
}

const browser = await chromium.launch({ headless, slowMo: Number.isFinite(slowMo) ? slowMo : 0 });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 960 } });
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
  await page.waitForURL((url) => url.port === appOrigin.port, { timeout: 45_000 });
  await page.waitForFunction(() => Boolean(localStorage.getItem('osionos:bridge-session')), null, { timeout: 45_000 });
  await page.getByRole('button', { name: new RegExp(`${username}'s osionos`, 'i') }).waitFor({ timeout: 30_000 });

  const bridgeData = await page.evaluate(() => JSON.parse(localStorage.getItem('osionos:bridge-session') || 'null'));
  const session = {
    url: page.url(),
    hasBridgeSession: Boolean(bridgeData),
    bridgePersona: bridgeData?.persona?.name ?? null,
    workspace: bridgeData?.session?.privateWorkspaces?.[0]?.name ?? null,
    accessTokenPrefix: bridgeData?.session?.accessToken?.slice(0, 11) ?? null,
  };

  if (!session.hasBridgeSession || session.bridgePersona !== username || session.workspace !== `${username}'s osionos`) {
    throw new Error(`Unexpected osionos session: ${JSON.stringify(session)}`);
  }

  const automationSession = {
    accessToken: bridgeData?.session?.accessToken ?? '',
    workspaceId: bridgeData?.session?.privateWorkspaces?.[0]?._id ?? '',
  };
  if (!automationSession.accessToken || !automationSession.workspaceId) {
    throw new Error('Bridge session did not expose a workspace token for persistence verification.');
  }

  await step('Creating a persisted markdown page through the osionos bridge API');
  const persistence = await createPersistedMarkdownPage(automationSession);

  await step('Reloading osionos and verifying the persisted page appears in the sidebar');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: new RegExp(escapeRegExp(`${username}'s osionos`), 'i') }).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: new RegExp(escapeRegExp(persistence.title), 'i') }).click();
  await page.getByRole('textbox', { name: 'Page title' }).waitFor({ timeout: 30_000 });
  const persistedTitle = await page.getByRole('textbox', { name: 'Page title' }).inputValue();
  if (persistedTitle !== persistence.title) {
    throw new Error(`Persisted page title mismatch: ${persistedTitle}`);
  }
  await page.getByText('Persisted from Docker Playwright through the osionos bridge API.').waitFor({ timeout: 10_000 });

  await step('Opening settings and checking the Mail & Calendar panel');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Mail & Calendar', exact: true }).click();
  await page.getByRole('tabpanel', { name: 'Mail & Calendar' }).waitFor({ timeout: 10_000 });
  await page.getByText(/osionos Mail/i).first().waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();

  await step('Opening osionos Mail and Calendar from the sidebar app buttons');
  await openSidebarApp('osionos Mail', mailUrl);
  await openSidebarApp('osionos Calendar', calendarUrl);

  await step('Probing Mail and Calendar bridge service sessions');
  const services = {
    mail: await probeMailBridge(),
    calendar: await probeCalendarBridge(),
  };

  await step('Full website, osionos, persistence, and app bridge simulation succeeded.', 'succeeded', { session, persistence, services });
  console.log(JSON.stringify({ session, persistence, services }, null, 2));
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
