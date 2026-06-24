#!/usr/bin/env node
/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agency-simulation.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Binocle Intelligence Agency — end-to-end organization simulation.
 *
 * Multiple Playwright browser contexts = different employees, exercising the
 * REAL stack (website portal auth → bridge sessions → editor → live database
 * → chat/DM → LiveKit video → feed). Each step logs PASS/FAIL/WARN and the
 * run continues on failure; the process exits non-zero when any step FAILED.
 *
 * Personas (tools/seeds/.agency-people.env):
 *   owner@agency.local        Helena Voss   director   BinocleOwner1!
 *   e01.reed@agency.local     Marcus Reed   deputy     AgencyDemo1!   (War Room member)
 *   e07.sullivan@agency.local Jack Sullivan field      AgencyDemo1!
 *   e08.petrova@agency.local  Nadia Petrova field      AgencyDemo1!
 *   e11.johansson@agency.local Erik Johansson analyst  AgencyDemo1!
 *
 * Compose service: `agency-simulation` (profile testing, network_mode host) —
 * run through `make agency-sim`. Artifacts (screenshots + results.json) land
 * in AGENCY_ARTIFACTS_DIR (host: apps/osionos/app/test-results/agency-simulation).
 */

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const websiteUrl = process.env.AGENCY_WEBSITE_URL ?? 'https://127.0.0.1:4322';
const appUrl = process.env.AGENCY_APP_URL ?? 'https://127.0.0.1:3001';
const bridgeUrl = process.env.AGENCY_BRIDGE_URL ?? 'https://127.0.0.1:4000';
const rootKongUrl = process.env.AGENCY_KONG_URL ?? 'https://127.0.0.1:8000';
const mailpitUrl = process.env.AGENCY_MAILPIT_URL ?? 'http://127.0.0.1:8025';
const livekitHttpUrl = process.env.AGENCY_LIVEKIT_HTTP_URL ?? 'http://127.0.0.1:7880';
const artifactsDir = process.env.AGENCY_ARTIFACTS_DIR ?? '/app/test-results/agency-simulation';
const peopleEnvPath = process.env.AGENCY_PEOPLE_ENV ?? '/seeds/.agency-people.env';
const tenantEnvPath = process.env.AGENCY_TENANT_ENV ?? '/seeds/.agency-tenant.env';
const appEnvPath = process.env.AGENCY_APP_ENV ?? '/app/.env';
const headless = process.env.AGENCY_HEADLESS !== '0';
const slowMo = Number.parseInt(process.env.AGENCY_SLOWMO_MS ?? '40', 10);
const serviceRoleKey = process.env.SERVICE_ROLE_KEY ?? '';
const livekitApiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
const livekitApiSecret = process.env.LIVEKIT_API_SECRET ?? 'devsecret-livekit-local-0123456789abcdef';
const stamp = Date.now();

const ORG_WS_ID = 'b1a0c1e5-0000-4000-a000-000000000001';
const OWNER = { email: 'owner@agency.local', password: 'BinocleOwner1!', label: 'owner' };
const EMPLOYEE_PASSWORD = 'AgencyDemo1!';

/* ── tiny env-file parser (KEY=VALUE lines, # comments) ─────────────────── */
async function loadEnvFile(path) {
	const out = {};
	let text = '';
	try { text = await readFile(path, 'utf8'); } catch { return out; }
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#') || !line.includes('=')) continue;
		const [key, ...rest] = line.split('=');
		out[key.trim()] = rest.join('=').trim();
	}
	return out;
}

/* ── step harness: continue-on-fail, JSON results, exit code ────────────── */
const results = [];
function record(name, status, detail = '') {
	const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️ ' : '❌';
	console.log(`[agency-sim] ${icon} ${status} — ${name}${detail ? ` — ${detail}` : ''}`);
	results.push({ name, status, detail, at: new Date().toISOString() });
}
async function step(name, fn) {
	console.log(`[agency-sim] ▶ ${name}`);
	try {
		const detail = await fn();
		record(name, 'PASS', typeof detail === 'string' ? detail : '');
	} catch (error) {
		record(name, 'FAIL', error instanceof Error ? error.message : String(error));
	}
}
function warn(name, detail) { record(name, 'WARN', detail); }

async function shot(page, file) {
	try { await page.screenshot({ path: `${artifactsDir}/${file}`, fullPage: false }); }
	catch { /* screenshots are best-effort */ }
}

async function fetchJson(url, options = {}) {
	const response = await fetch(url, options);
	const text = await response.text().catch(() => '');
	let payload = {};
	try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text.slice(0, 200) }; }
	return { status: response.status, ok: response.ok, payload };
}

/* ── bridge API helpers (Node-side; NODE_EXTRA_CA_CERTS trusts the proxy) ── */
async function bridgeLogin(email, password) {
	const { ok, status, payload } = await fetchJson(`${bridgeUrl}/api/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});
	if (!ok) throw new Error(`bridge login ${email} → ${status} ${payload?.message ?? ''}`);
	return { token: payload.session.accessToken, userId: payload.user.id, session: payload.session };
}
function bearer(token) { return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }; }

/* ── browser flows ──────────────────────────────────────────────────────── */
async function loginViaWebsite(browser, { email, password, label }) {
	const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 920 } });
	const page = await context.newPage();
	await page.goto(websiteUrl, { waitUntil: 'domcontentloaded' });
	await page.getByRole('button', { name: /Start free/i }).first().click();
	await page.locator('#portal[open]').waitFor({ timeout: 15_000 });
	await page.locator('[data-auth-switch="login"]').click();
	await page.locator('#portal-email').fill(email);
	await page.locator('#portal-password').fill(password);
	await page.locator('#portal [data-login-submit]').click();
	await page.waitForURL((url) => url.port === new URL(appUrl).port, { timeout: 60_000 });
	await page.waitForFunction(() => Boolean(localStorage.getItem('osionos:bridge-session')), null, { timeout: 60_000 });
	await page.locator('[aria-label="More workspace options"]').waitFor({ timeout: 30_000 });
	console.log(`[agency-sim]   ${label} signed in through the website portal`);
	return { context, page };
}

/** The user-switcher popover only closes on an OUTSIDE pointerdown. */
async function closeSwitcherPanel(page) {
	await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
	await page.getByRole('button', { name: 'Log out', exact: true })
		.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
}

async function switchToAgencyWorkspace(page) {
	const switcher = page.locator('[aria-label="More workspace options"]');
	await switcher.click();
	const target = page.getByRole('button', { name: /Binocle Intelligence Agency/i }).first();
	await target.waitFor({ timeout: 15_000 });
	await target.click();
	await closeSwitcherPanel(page);
	await page.getByRole('button', { name: /Mission Control/i }).first().waitFor({ timeout: 30_000 });
}

async function openTreePage(page, parentPattern, titlePattern) {
	if (parentPattern) {
		const parent = page.getByRole('button', { name: parentPattern }).first();
		await parent.waitFor({ timeout: 20_000 });
		await parent.click();
	}
	const item = page.getByRole('button', { name: titlePattern }).first();
	await item.waitFor({ timeout: 20_000 });
	await item.click();
}

async function openDmWith(page, personPattern, searchText) {
	await page.locator('[aria-label="Start a direct message"]').click();
	await page.getByPlaceholder('Search people…').fill(searchText);
	const person = page.getByRole('button', { name: personPattern }).first();
	await person.waitFor({ timeout: 15_000 });
	await person.click();
	await page.locator('textarea[placeholder^="Message #"]').waitFor({ timeout: 20_000 });
}

async function sendChannelMessage(page, text) {
	const box = page.locator('textarea[placeholder^="Message #"]').last();
	await box.fill(text);
	await page.locator('[aria-label="Send message"]').last().click();
	await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15_000 });
}

/* ── realtime WS probe (HS256 token from the app env) ───────────────────── */
function wsSubscribe({ wsUrl, token, topic, eventType, waitMs = 20_000 }) {
	let settle;
	const done = new Promise((resolve) => { settle = resolve; });
	const ws = new WebSocket(wsUrl);
	const timer = setTimeout(() => { settle({ ok: false, reason: 'timeout' }); try { ws.close(); } catch { /* noop */ } }, waitMs);
	ws.onopen = () => ws.send(JSON.stringify({ type: 'AUTH', token }));
	ws.onerror = () => { clearTimeout(timer); settle({ ok: false, reason: 'ws error' }); };
	ws.onmessage = (m) => {
		let frame;
		try { frame = JSON.parse(m.data); } catch { return; }
		if (frame.type === 'AUTH_OK') ws.send(JSON.stringify({ type: 'SUBSCRIBE', sub_id: 's1', topic }));
		else if (frame.type === 'EVENT' && frame.event?.event_type === eventType) {
			clearTimeout(timer);
			settle({ ok: true, payload: frame.event.payload });
			try { ws.close(); } catch { /* noop */ }
		} else if (frame.type === 'ERROR') {
			clearTimeout(timer);
			settle({ ok: false, reason: `${frame.code} ${frame.message}` });
		}
	};
	return { done, close: () => { try { ws.close(); } catch { /* noop */ } } };
}

/* ── LiveKit helpers ────────────────────────────────────────────────────── */
function mintLivekitAdminJwt() {
	return import('node:crypto').then(({ createHmac }) => {
		const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
		const now = Math.floor(Date.now() / 1000);
		const head = b64u({ alg: 'HS256', typ: 'JWT' });
		const body = b64u({ iss: livekitApiKey, sub: 'agency-sim-admin', nbf: now - 10, exp: now + 600, video: { roomList: true } });
		const sig = createHmac('sha256', livekitApiSecret).update(`${head}.${body}`).digest('base64url');
		return `${head}.${body}.${sig}`;
	});
}
async function listLivekitRooms() {
	const jwt = await mintLivekitAdminJwt();
	const { payload } = await fetchJson(`${livekitHttpUrl}/twirp/livekit.RoomService/ListRooms`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
		body: '{}',
	});
	return Array.isArray(payload.rooms) ? payload.rooms : [];
}
function resolveLivekitUmdPath() {
	const require = createRequire(import.meta.url);
	for (const candidate of [
		'livekit-client',
		'livekit-client/dist/livekit-client.umd.min.js',
		'livekit-client/dist/livekit-client.umd.js',
	]) {
		try { return require.resolve(candidate); } catch { /* next */ }
	}
	return null;
}
async function joinLivekitRoom(page, { url, token }) {
	return page.evaluate(async ({ url: wsUrl, token: accessToken }) => {
		const room = new window.LivekitClient.Room();
		await room.connect(wsUrl, accessToken);
		try { await room.localParticipant.setMicrophoneEnabled(true); } catch { /* fake device may refuse */ }
		window.__agencyRooms = window.__agencyRooms ?? [];
		window.__agencyRooms.push(room);
		return room.state;
	}, { url, token });
}
async function leaveLivekitRooms(page) {
	await page.evaluate(async () => {
		for (const room of window.__agencyRooms ?? []) {
			try { await room.disconnect(); } catch { /* already gone */ }
		}
		window.__agencyRooms = [];
	}).catch(() => undefined);
}

/* ── main ───────────────────────────────────────────────────────────────── */
await mkdir(artifactsDir, { recursive: true });
const people = await loadEnvFile(peopleEnvPath);
const tenant = await loadEnvFile(tenantEnvPath);
const appEnv = await loadEnvFile(appEnvPath);

function person(index) {
	const row = people[`AGENCY_PERSON_${index}`] ?? '';
	const [id, email, name] = row.split('|');
	return { id, email, name, password: EMPLOYEE_PASSWORD };
}
const marcus = person(1);   // deputy — War Room member
const jack = person(7);     // field agent
const nadia = person(8);    // field agent
const erik = person(11);    // analyst

const AGENCY_DB_ID = tenant.AGENCY_DB_ID ?? 'd3ecb3e1-9947-41a6-a0d3-ff2063b4adee';
const AGENCY_API_KEY = tenant.AGENCY_API_KEY ?? '';
const AGENCY_ANON_APIKEY = tenant.AGENCY_ANON_APIKEY ?? '';
const baasKongUrl = (appEnv.VITE_BAAS_URL ?? 'http://127.0.0.1:8002').replace(/\/$/, '');
const realtimeToken = appEnv.VITE_BAAS_REALTIME_TOKEN ?? '';
const realtimeWsUrl = `${baasKongUrl.replace(/^http/, 'ws')}/realtime/v1/ws`;

function gatewayHeaders() {
	return { 'Content-Type': 'application/json', apikey: AGENCY_ANON_APIKEY, 'X-Baas-Api-Key': AGENCY_API_KEY };
}
async function gatewayTableOp(table, body) {
	const { ok, status, payload } = await fetchJson(`${baasKongUrl}/query/v1/${AGENCY_DB_ID}/tables/${table}`, {
		method: 'POST', headers: gatewayHeaders(), body: JSON.stringify(body),
	});
	if (!ok) throw new Error(`gateway ${table} ${body.op} → ${status}: ${JSON.stringify(payload).slice(0, 160)}`);
	return payload;
}

const browser = await chromium.launch({
	headless,
	slowMo: Number.isFinite(slowMo) ? slowMo : 0,
	args: [
		'--use-fake-ui-for-media-stream',
		'--use-fake-device-for-media-stream',
		'--allow-running-insecure-content',
	],
});

let owner = null;      // { context, page }
let analyst = null;
let jackCtx = null;
let nadiaCtx = null;
const apiTokens = {};  // label → bridge token (Node-side sessions)

/* 1 ── owner logs in through the REAL website auth flow */
await step('1. owner login (website portal → bridge handoff → editor)', async () => {
	owner = await loginViaWebsite(browser, OWNER);
	const persona = await owner.page.evaluate(() => JSON.parse(localStorage.getItem('osionos:bridge-session') || 'null')?.persona?.name ?? null);
	await shot(owner.page, '01-editor-home.png');
	return `persona=${persona}`;
});

/* 2 ── owner switches to the org workspace; wiki tree is reachable */
await step('2. owner opens the Binocle Intelligence Agency workspace (wiki tree)', async () => {
	if (!owner) throw new Error('owner context missing (step 1 failed)');
	await switchToAgencyWorkspace(owner.page);
	await owner.page.getByRole('button', { name: /Agency Handbook/i }).first().waitFor({ timeout: 20_000 });
	await shot(owner.page, '02-agency-workspace.png');
	return 'Mission Control + Agency Handbook visible in the sidebar tree';
});

/* 3 ── owner invites a NEW employee; the invitation email lands in Mailpit */
await step('3. owner invites a new employee (Settings → People) + Mailpit email', async () => {
	if (!owner) throw new Error('owner context missing');
	const recruit = `w3.recruit.${stamp}@agency.local`;
	const page = owner.page;
	await page.locator('aside').getByRole('button', { name: 'Settings', exact: true }).first().click();
	await page.getByRole('tab', { name: 'People', exact: true }).click();
	await page.getByRole('button', { name: /Add members/i }).click();
	await page.getByPlaceholder('name@example.com').fill(recruit);
	await page.getByRole('button', { name: 'Invite', exact: true }).click();
	await page.getByText(recruit).first().waitFor({ timeout: 15_000 });
	await shot(page, '03-invite-people.png');
	await page.getByRole('button', { name: 'Close settings', exact: true }).click();

	// The People panel stores the pending invite client-side (no bridge
	// /api/workspaces/:id/invites route yet) — the EMAIL leg goes through the
	// platform's real gotrue invite path (Kong /auth/v1, service role).
	if (!serviceRoleKey) throw new Error('SERVICE_ROLE_KEY missing — cannot exercise the gotrue invite path');
	const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey };
	const invite = await fetchJson(`${rootKongUrl}/auth/v1/invite`, { method: 'POST', headers: auth, body: JSON.stringify({ email: recruit }) });
	if (!invite.ok) throw new Error(`gotrue invite → ${invite.status}`);
	let found = false;
	for (let attempt = 0; attempt < 10 && !found; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 700));
		const mail = await fetchJson(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(recruit)}`);
		found = (mail.payload?.messages_count ?? mail.payload?.messages?.length ?? 0) >= 1;
	}
	// cleanup the probe account (keeps gotrue at 21 agency users)
	if (invite.payload?.id) {
		await fetchJson(`${rootKongUrl}/auth/v1/admin/users/${invite.payload.id}`, { method: 'DELETE', headers: auth });
	}
	if (!found) throw new Error('invitation email never reached Mailpit');
	return `pending invite row + invitation email for ${recruit} (UI invite store is client-side — bridge route pending)`;
});

/* 4 ── permissions matrix panel (WS-C admin surface) */
await step('4. owner opens the Permissions matrix panel (Settings → Permissions)', async () => {
	if (!owner) throw new Error('owner context missing');
	const page = owner.page;
	await page.locator('aside').getByRole('button', { name: 'Settings', exact: true }).first().click();
	await page.getByRole('tab', { name: 'Permissions', exact: true }).click();
	await page.getByRole('tabpanel', { name: 'Permissions' }).waitFor({ timeout: 15_000 });
	await page.waitForTimeout(1500); // let the matrix hydrate from /api/perms
	await shot(page, '04-permissions-matrix.png');
	await page.getByRole('button', { name: 'Close settings', exact: true }).click();
	return 'role × resource matrix rendered';
});

/* 5 ── analyst logs in, opens the live transactions table */
await step('5. analyst login + live transactions table (Erik’s notebook embed)', async () => {
	analyst = await loginViaWebsite(browser, { email: erik.email, password: erik.password, label: 'analyst' });
	await switchToAgencyWorkspace(analyst.page);
	await openTreePage(analyst.page, /Analyst Notebooks/i, /Erik Johansson — Working Notes/i);
	const embed = analyst.page.locator(`[data-database-id="baas:${AGENCY_DB_ID}:transactions"]`).first();
	await embed.waitFor({ timeout: 30_000 });
	await analyst.page.waitForTimeout(2500); // live rows hydrate
	await shot(analyst.page, '05-analyst-live-table.png');
	return 'live database_inline embed (transactions) rendered';
});

/* 6 ── field masks: decide carries the amount mask; UI enforcement recorded */
await step('6. analyst field mask — /api/perms/decide redacts transactions.amount', async () => {
	const { ok, payload } = await fetchJson(`${bridgeUrl}/api/perms/decide`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ user: { id: erik.id }, resource_type: 'table', resource_name: 'transactions', op: 'list' }),
	});
	if (!ok || payload.allow !== true) throw new Error(`decide failed: ${JSON.stringify(payload).slice(0, 120)}`);
	const masked = JSON.stringify(payload.mask ?? {}).includes('"amount":"***"');
	if (!masked) throw new Error(`amount mask absent: ${JSON.stringify(payload).slice(0, 160)}`);
	if (analyst) {
		const text = await analyst.page.locator(`[data-database-id="baas:${AGENCY_DB_ID}:transactions"]`).first().innerText().catch(() => '');
		if (text && !text.includes('***')) {
			warn('6b. UI mask enforcement', 'pending — the osionos read path uses the shared tenant key (no per-user identity), masks are decide-only today');
		}
	}
	return 'decide → allow + {redact:{amount:"***"}}';
});

/* 7 ── owner edits a live cell; analyst sees the new value */
await step('7. live edit roundtrip — owner updates a transactions cell, analyst sees it', async () => {
	if (!analyst) throw new Error('analyst context missing');
	const embed = analyst.page.locator(`[data-database-id="baas:${AGENCY_DB_ID}:transactions"]`).first();
	const visibleText = await embed.innerText().catch(() => '');
	const listed = await gatewayTableOp('transactions', { op: 'list', limit: 40 });
	const rows = Array.isArray(listed.rows) ? listed.rows : [];
	const target = rows.find((row) => row.counterparty && visibleText.includes(String(row.counterparty))) ?? rows[0];
	if (!target) throw new Error('no transactions rows listed through the gateway');
	const original = target.counterparty;
	const probeValue = `W3 Sim Trading ${stamp}`;

	const probe = realtimeToken
		? wsSubscribe({ wsUrl: realtimeWsUrl, token: realtimeToken, topic: `table:${AGENCY_DB_ID}:transactions`, eventType: 'row_changed' })
		: null;
	await gatewayTableOp('transactions', { op: 'update', filter: { id: target.id }, data: { counterparty: probeValue } });
	const wsResult = probe ? await probe.done : { ok: false, reason: 'no realtime token' };

	let mode = '';
	const appeared = await analyst.page.getByText(probeValue, { exact: false }).first()
		.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
	if (appeared) {
		mode = 'LIVE (row_changed pushed into the open embed)';
	} else {
		await analyst.page.reload({ waitUntil: 'domcontentloaded' });
		await openTreePage(analyst.page, /Analyst Notebooks/i, /Erik Johansson — Working Notes/i).catch(() => undefined);
		const afterReload = await analyst.page.getByText(probeValue, { exact: false }).first()
			.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
		mode = afterReload ? 'after refresh' : '';
	}
	await shot(analyst.page, '06-live-edit.png');
	// restore the original value (shared data set stays pristine)
	await gatewayTableOp('transactions', { op: 'update', filter: { id: target.id }, data: { counterparty: original } });
	if (!mode && !wsResult.ok) throw new Error('new value neither rendered nor delivered as row_changed');
	if (!mode) {
		warn('7b. analyst embed render', `row id=${target.id} not visible in the embed view — realtime row_changed verified instead`);
		mode = 'row_changed event verified (embed does not render that row/column)';
	}
	return `row id=${target.id} counterparty → "${probeValue}" seen ${mode}; ws=${wsResult.ok ? 'row_changed ✓' : wsResult.reason}; value restored`;
});

/* 8 ── DM privacy: two agents talk, a third context is locked out */
await step('8. DM privacy — Jack ↔ Nadia talk; analyst is excluded (UI + API 403)', async () => {
	jackCtx = await loginViaWebsite(browser, { email: jack.email, password: jack.password, label: 'jack' });
	nadiaCtx = await loginViaWebsite(browser, { email: nadia.email, password: nadia.password, label: 'nadia' });
	const dmText = `Stakeout at the docks — ${stamp}`;
	const replyText = `Copy that, bringing the long lens — ${stamp}`;

	await openDmWith(jackCtx.page, /Nadia Petrova|e08\.petrova/i, 'petrova');
	await sendChannelMessage(jackCtx.page, dmText);
	await shot(jackCtx.page, '07-dm-jack.png');

	// Nadia: her DM list hydrated at login, BEFORE the channel existed —
	// reload so useDmChannels refetches, then open the DM and read + reply.
	await nadiaCtx.page.reload({ waitUntil: 'domcontentloaded' });
	await nadiaCtx.page.locator('aside').getByRole('button', { name: /(Sullivan|e07\.sullivan).*(Petrova|e08\.petrova)|(Petrova|e08\.petrova).*(Sullivan|e07\.sullivan)/i }).first().click({ timeout: 20_000 });
	await nadiaCtx.page.getByText(dmText, { exact: false }).first().waitFor({ timeout: 20_000 });
	await sendChannelMessage(nadiaCtx.page, replyText);
	await shot(nadiaCtx.page, '08-dm-nadia.png');

	// Jack receives the reply (cross-user, live or via refetch)
	const replyLive = await jackCtx.page.getByText(replyText, { exact: false }).first()
		.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);

	// third party: Erik must neither list nor read the channel
	await analyst.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
	await analyst.page.locator('aside').waitFor({ timeout: 20_000 }).catch(() => undefined);
	const erikDmVisible = await analyst.page.locator('aside').getByRole('button', { name: /(Sullivan|e07\.sullivan).*(Petrova|e08\.petrova)/i }).first()
		.isVisible().catch(() => false);
	apiTokens.erik = apiTokens.erik ?? (await bridgeLogin(erik.email, erik.password)).token;
	apiTokens.jack = apiTokens.jack ?? (await bridgeLogin(jack.email, jack.password)).token;
	const channels = await fetchJson(`${bridgeUrl}/api/chat/channels`, { headers: bearer(apiTokens.jack) });
	const dm = (channels.payload.channels ?? []).find((c) => c.kind === 'dm' && /sullivan/i.test(c.name) && /petrova/i.test(c.name));
	if (!dm) throw new Error('jack cannot list the DM channel he just used');
	const third = await fetchJson(`${bridgeUrl}/api/chat/channels/${dm.id}/messages`, { headers: bearer(apiTokens.erik) });
	if (third.status !== 403) throw new Error(`third-party DM read must be 403, got ${third.status}`);
	if (erikDmVisible) throw new Error('the DM leaked into the analyst sidebar');
	return `roundtrip ok (reply ${replyLive ? 'arrived live' : 'arrived after refetch'}); analyst: hidden in UI + API 403`;
});

/* 9 ── channel chat roundtrip through the sidebar Channels section */
await step('9. cross-context chat roundtrip (owner ↔ analyst via sidebar #general)', async () => {
	if (!owner || !analyst) throw new Error('owner/analyst context missing');
	const pingText = `Daily intel sync in five — ${stamp}`;
	const pongText = `On my way with the Meridian charts — ${stamp}`;
	// owner: open #general from the sidebar Channels section (bridge text
	// channels now have a wired entry — widgets/channel-list).
	const ownerChannels = owner.page.locator('aside [data-channel-list]');
	await ownerChannels.waitFor({ timeout: 20_000 });
	await ownerChannels.getByRole('button', { name: /general/i }).first().click();
	await owner.page.locator('textarea[placeholder^="Message #"]').last().waitFor({ timeout: 20_000 });
	await sendChannelMessage(owner.page, pingText);
	await shot(owner.page, '09a-channel-owner.png');
	// analyst: same channel from HIS sidebar; history carries the ping; reply.
	const analystChannels = analyst.page.locator('aside [data-channel-list]');
	await analystChannels.waitFor({ timeout: 20_000 });
	await analystChannels.getByRole('button', { name: /general/i }).first().click();
	await analyst.page.getByText(pingText, { exact: false }).first().waitFor({ timeout: 20_000 });
	await sendChannelMessage(analyst.page, pongText);
	const live = await owner.page.getByText(pongText, { exact: false }).first()
		.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
	await shot(owner.page, '09-channel-view.png');
	return `#general roundtrip via the sidebar Channels entry (reply ${live ? 'live over the realtime WS' : 'after refetch'})`;
});

/* 10 ── video: owner joins the War Room through the channel header "Join call"
        button (CallPanel → VideoRoomView); the deputy is the second participant */
await step('10. video — owner joins the War Room via "Join call"; ≥2 participants', async () => {
	if (!owner) throw new Error('owner context missing');
	apiTokens.owner = apiTokens.owner ?? (await bridgeLogin(OWNER.email, OWNER.password)).token;
	apiTokens.marcus = apiTokens.marcus ?? (await bridgeLogin(marcus.email, marcus.password)).token;
	const channels = await fetchJson(`${bridgeUrl}/api/chat/channels?workspaceId=${ORG_WS_ID}`, { headers: bearer(apiTokens.owner) });
	const warRoom = (channels.payload.channels ?? []).find((c) => c.kind === 'video');
	if (!warRoom) throw new Error('no video channel on the org workspace');

	// owner: sidebar Channels section → War Room (camera glyph) → header "Join call"
	const ownerChannels = owner.page.locator('aside [data-channel-list]');
	await ownerChannels.waitFor({ timeout: 20_000 });
	await ownerChannels.getByRole('button', { name: new RegExp(warRoom.name, 'i') }).first().click();
	const joinButton = owner.page.getByRole('button', { name: /Join call/i }).first();
	await joinButton.waitFor({ timeout: 20_000 });
	await joinButton.click();
	await owner.page.locator('[data-call-panel]').waitFor({ timeout: 15_000 });
	// connected once the call header counts participants ("1 in call", then 2)
	await owner.page.locator('[data-call-panel]').getByText(/in call/i).first().waitFor({ timeout: 30_000 });
	await shot(owner.page, '10a-join-call.png');

	// deputy joins as the second participant (livekit-client + real bridge grant)
	const marcusRtc = await fetchJson(`${bridgeUrl}/api/rtc/token`, { method: 'POST', headers: bearer(apiTokens.marcus), body: JSON.stringify({ channelId: warRoom.id }) });
	if (!marcusRtc.ok) throw new Error(`rtc token: marcus=${marcusRtc.status}`);
	const umdPath = resolveLivekitUmdPath();
	if (!umdPath) throw new Error('livekit-client UMD bundle not found in node_modules');
	const marcusPage = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
	await marcusPage.goto('about:blank');
	await marcusPage.addScriptTag({ path: umdPath });
	await joinLivekitRoom(marcusPage, { url: marcusRtc.payload.url, token: marcusRtc.payload.token });

	let participants = 0;
	for (let attempt = 0; attempt < 10 && participants < 2; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 800));
		const rooms = await listLivekitRooms();
		const room = rooms.find((r) => r.name === marcusRtc.payload.room);
		participants = Number(room?.numParticipants ?? room?.num_participants ?? 0);
	}
	await shot(owner.page, '10-video-war-room.png');

	// owner leaves through the UI control; the call panel unmounts back to chat
	await owner.page.getByRole('button', { name: 'Leave call', exact: true }).click();
	await owner.page.locator('[data-call-panel]').waitFor({ state: 'detached', timeout: 10_000 });
	await leaveLivekitRooms(marcusPage);
	await marcusPage.context().close().catch(() => undefined);
	if (participants < 2) throw new Error(`expected ≥2 participants, ListRooms saw ${participants}`);
	return `room ${marcusRtc.payload.room}: ${participants} participants — owner through the channel-header "Join call" (VideoRoomView), deputy via livekit-client; owner left via the UI`;
});

/* 11 ── feed: like + comment travel cross-user */
await step('11. feed — owner like + comment on a case wiki, analyst sees both', async () => {
	apiTokens.owner = apiTokens.owner ?? (await bridgeLogin(OWNER.email, OWNER.password)).token;
	apiTokens.erik = apiTokens.erik ?? (await bridgeLogin(erik.email, erik.password)).token;
	const pages = await fetchJson(`${bridgeUrl}/api/pages?workspaceId=${ORG_WS_ID}`, { headers: bearer(apiTokens.owner) });
	const wiki = (pages.payload ?? []).find((p) => /Operation Nightfall/.test(p.title)) ?? (pages.payload ?? [])[0];
	if (!wiki) throw new Error('no org wiki page found');
	const before = await fetchJson(`${bridgeUrl}/api/feed/${wiki._id}/likes`, { headers: bearer(apiTokens.erik) });
	await fetchJson(`${bridgeUrl}/api/feed/${wiki._id}/like`, { method: 'POST', headers: bearer(apiTokens.owner) });
	const after = await fetchJson(`${bridgeUrl}/api/feed/${wiki._id}/likes`, { headers: bearer(apiTokens.erik) });
	const commentText = `Reviewed during the verification pass — ${new Date().toISOString().slice(0, 10)}`;
	await fetchJson(`${bridgeUrl}/api/feed/${wiki._id}/comments`, { method: 'POST', headers: bearer(apiTokens.owner), body: JSON.stringify({ content: commentText }) });
	const comments = await fetchJson(`${bridgeUrl}/api/feed/${wiki._id}/comments`, { headers: bearer(apiTokens.erik) });
	const seen = JSON.stringify(comments.payload).includes(commentText);
	// undo the like so repeated runs do not inflate counts (comments stay — they read as real activity)
	await fetchJson(`${bridgeUrl}/api/feed/${wiki._id}/like`, { method: 'DELETE', headers: bearer(apiTokens.owner) });
	if (Number(after.payload.count) < Number(before.payload.count) + 1) throw new Error('like count did not increase cross-user');
	if (!seen) throw new Error('analyst cannot read the owner comment');
	return `"${wiki.title}": like count ${before.payload.count}→${after.payload.count} + comment visible to the analyst (FeedView UI is a database view preset — interactions asserted via API)`;
});

/* 12 ── share: owner opens the page-header Share popover (WS-C SharePopover) */
await step('12. share — owner opens the Share popover on Mission Control', async () => {
	if (!owner) throw new Error('owner context missing');
	const page = owner.page;
	await page.locator('aside').getByRole('button', { name: /Mission Control/i }).first().click();
	const shareButton = page.getByRole('button', { name: 'Share page', exact: true }).first();
	await shareButton.waitFor({ timeout: 20_000 });
	await shareButton.click();
	const dialog = page.getByRole('dialog', { name: 'Share', exact: true });
	await dialog.waitFor({ timeout: 15_000 });
	await dialog.getByPlaceholder('Add people by name, email or role…').waitFor({ timeout: 15_000 });
	await dialog.getByText('General access', { exact: false }).waitFor({ timeout: 20_000 });
	await shot(page, '12-share-popover.png');
	await dialog.getByRole('button', { name: 'Close share dialog', exact: true }).click();
	await dialog.waitFor({ state: 'detached', timeout: 10_000 });
	return 'Share popover mounted in the page header: people picker + access list + General access render against /api/perms';
});

/* ── wrap up ────────────────────────────────────────────────────────────── */
await browser.close().catch(() => undefined);
const failed = results.filter((r) => r.status === 'FAIL');
const warned = results.filter((r) => r.status === 'WARN');
await writeFile(`${artifactsDir}/results.json`, JSON.stringify({
	finishedAt: new Date().toISOString(),
	pass: results.filter((r) => r.status === 'PASS').length,
	warn: warned.length,
	fail: failed.length,
	results,
}, null, 2));
console.log(`\n[agency-sim] ${results.filter((r) => r.status === 'PASS').length} PASS / ${warned.length} WARN / ${failed.length} FAIL`);
console.log(`[agency-sim] artifacts: ${artifactsDir}`);
if (failed.length > 0) {
	console.error('[agency-sim] FAILED steps:');
	for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
	process.exitCode = 1;
}
