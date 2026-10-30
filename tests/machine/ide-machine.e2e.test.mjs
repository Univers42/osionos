/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-machine.e2e.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Phase 1 end to end (ADR-006): the app frames the IDE origin, hands it a node-scoped token, and
// the owner edits, saves and uses a terminal on this machine through the real VS Code server.
// Needs the pinned server unpacked: OSIONOS_SERVER_LIB=<.../lib>, and `pnpm build:ide`.
// Without them the suite is reported as skipped, never as passed.
// Run: OSIONOS_SERVER_LIB=... OSIONOS_E2E_CHROME=<chrome> node --test tests/machine/

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { makeFolder, startApp, startNode, tempRoot } from './harness.mjs';

const SERVER_LIB = process.env.OSIONOS_SERVER_LIB;
const READY = SERVER_LIB && existsSync(join(SERVER_LIB, 'vscode', 'out', 'server-main.js')) && existsSync(new URL('../../dist-ide/index.html', import.meta.url));
const IDE_PORT = 43100 + Math.floor(Math.random() * 400);
const APP_PORT = IDE_PORT + 500;
const IDE_ORIGIN = `http://127.0.0.1:${IDE_PORT}`;

// Caveat: every wait below is a wall-clock bound sized for this laptop; a loaded machine can
// fail one, and the failure names what it waited for.
async function until(probe, ms, what) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		const value = await probe();
		if (value) return value;
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error(`timed out after ${ms} ms waiting for ${what}`);
}

test('the framed IDE edits, saves and runs a terminal on this machine', { skip: READY ? false : 'OSIONOS_SERVER_LIB or dist-ide missing', timeout: 240_000 }, async (t) => {
	const { chromium } = await import('playwright');
	const root = tempRoot();
	const folder = makeFolder(root);
	const node = await startNode({ serverLib: SERVER_LIB, home: root, idePort: IDE_PORT, appOrigin: `http://127.0.0.1:${APP_PORT}` });
	const app = await startApp({ appPort: APP_PORT, ideUrl: `${IDE_ORIGIN}/?node=laptop&folder=${encodeURIComponent(folder)}`, ideOrigin: IDE_ORIGIN });
	const browser = await chromium.launch({ executablePath: process.env.OSIONOS_E2E_CHROME || undefined, args: ['--no-proxy-server'] });
	const har = join(root, 'session.har');
	const context = await browser.newContext({ viewport: { width: 1320, height: 860 }, recordHar: { path: har, content: 'omit' } });
	t.after(async () => { await browser.close(); await app.close(); await node.stop(); rmSync(root, { recursive: true, force: true }); });

	const page = await context.newPage();
	const errors = [];
	page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
	page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
	await page.goto(`http://127.0.0.1:${APP_PORT}/`);
	const frame = await until(() => page.frames().find((f) => f.url().startsWith(IDE_ORIGIN)), 10_000, 'the IDE frame');
	await until(() => page.evaluate(() => window.__ide.states.includes('connected')), 90_000, 'the machine to connect');
	await frame.locator('#status[data-state="connected"]').waitFor({ timeout: 5_000 });

	// The app may show a file; the editor then holds the machine's copy.
	await page.evaluate(() => window.__ideOpen('app.py'));
	await frame.locator('.monaco-editor .view-lines').filter({ hasText: 'def add' }).waitFor({ timeout: 30_000 });

	// Edit and save land on this machine's disk.
	await frame.locator('.monaco-editor .view-lines').click();
	await page.keyboard.press('Control+End');
	await page.keyboard.type('\n# saved-through-osionos\n');
	await page.keyboard.press('Control+S');
	await until(() => readFileSync(join(folder, 'app.py'), 'utf8').includes('# saved-through-osionos'), 20_000, 'the save on disk');

	// C11: the folder is not trusted yet, so its folder-open task has not run.
	await new Promise((resolve) => setTimeout(resolve, 3000));
	assert.equal(existsSync(join(folder, 'untrusted-task-ran')), false, 'an untrusted folder task ran');

	// A terminal process runs code, so VS Code asks whether the owner trusts the folder; yes.
	await frame.locator('#new-terminal').click();
	const trust = frame.locator('.monaco-dialog-box .monaco-button').filter({ hasText: /trust/i }).filter({ hasNotText: /don.t|not/i }).first();
	await trust.waitFor({ timeout: 30_000 }).catch(async (error) => {
		await page.screenshot({ path: '/tmp/ide-machine-fail.png' });
		throw new Error(`${error.message}\nstatus: ${await frame.locator('#status').textContent()}\nconsole errors:\n${errors.slice(-8).join('\n')}`);
	});
	await trust.click();

	// The terminal is this machine's own shell, in this folder.
	await frame.locator('#terminal .xterm').waitFor({ timeout: 30_000 });
	// The owner's own login shell answers; type once its prompt is drawn. `pwd >` is the plainest
	// form every shell, the owner's own minishell included, understands.
	// Caveat: the terminal paints to a canvas, so readiness is a fixed 3 s pause, not the prompt.
	await new Promise((resolve) => setTimeout(resolve, 3000));
	await frame.locator('#terminal .xterm').click();
	await page.keyboard.type('pwd > terminal-probe\n');
	await until(() => existsSync(join(folder, 'terminal-probe')), 30_000, 'the terminal to write its probe').catch(async (error) => {
		await page.screenshot({ path: '/tmp/ide-machine-fail.png' });
		throw error;
	});
	assert.equal(readFileSync(join(folder, 'terminal-probe'), 'utf8').trim(), folder);

	// C0-F2: a message asking to type into a terminal changes nothing.
	await page.evaluate(() => window.__ideSend({ type: 'osionos-ide/terminal', text: 'touch injected\n' }));
	await page.evaluate(() => window.__ideOpen('.git/hooks/post-checkout'));
	await new Promise((resolve) => setTimeout(resolve, 1500));
	assert.equal(existsSync(join(folder, 'injected')), false);

	// A8: no connection token anywhere, and the node cookie is out of script's reach.
	assert.equal(await frame.evaluate(() => document.cookie.includes('osio-node')), false, 'the node cookie is readable by script');
	await context.close();
	const recorded = readFileSync(har, 'utf8');
	// VS Code appends an empty `tkn=` to every resource URL when it has no token; only a value
	// would be a leak (the proxy drops the parameter either way).
	const leaks = [...recorded.matchAll(/.{0,80}([?&]tkn=[^&"\s]|connectionToken|vscode-tkn).{0,80}/g)].map((match) => match[0]);
	assert.deepEqual(leaks, [], 'a connection token in the recorded session');
	assert.deepEqual(errors.filter((text) => /Content Security Policy|Refused to/.test(text)), [], 'CSP violations');
});
