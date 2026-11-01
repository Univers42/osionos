// A paired machine end to end (own-machines plan §6, devil 2026-10-31, 2 and 5): the app page says
// hello with a nonce, the IDE window relays the node's signed whoami, the app checks it with the
// machine's public key and hands over a bridge-signed osionos_mc1 token, and the window opens the
// machine's home folder with no folder in its address. The bridge is played by this test's keys.
// Needs the pinned server unpacked: OSIONOS_SERVER_LIB=<.../lib>, and `pnpm build:ide`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { makeFolder, OWNER, startPairedNode, tempRoot } from './harness.mjs';
import { saveMachine } from '../../packages/osionos-node/machine-identity.mjs';
import { bridgeKeyFromSeed, signMachineToken, whoamiMessage } from '../../scripts/ide-machine-protocol.mjs';
import { generateAgentKeyPair, verifyMessage } from '../../scripts/ide-agent-frames.mjs';

const SERVER_LIB = process.env.OSIONOS_SERVER_LIB;
const READY = SERVER_LIB && existsSync(join(SERVER_LIB, 'vscode', 'out', 'server-main.js')) && existsSync(new URL('../../dist-ide/index.html', import.meta.url));
const IDE_PORT = 47300 + Math.floor(Math.random() * 400);
const APP_PORT = IDE_PORT + 500;
const IDE_ORIGIN = `http://127.0.0.1:${IDE_PORT}`;
const APP_ORIGIN = `http://localhost:${APP_PORT}`;
const BRIDGE = 'https://bridge.test:10000';
const MACHINE = 'm-abcdefghijklmnop';
const SEED = randomBytes(32).toString('base64url');
const KEY = bridgeKeyFromSeed(SEED);

const APP_PAGE = (ideUrl) => `<!doctype html><title>app</title><button id="open">Open</button>
<script type="module">
  const ideOrigin = ${JSON.stringify(IDE_ORIGIN)};
  let target = null;
  window.__ide = { states: [], identity: null };
  document.getElementById('open').addEventListener('click', () => { target = window.open(${JSON.stringify(ideUrl)}, 'osionos-machine'); });
  let nonce = null;
  addEventListener('message', async (event) => {
    if (event.origin !== ideOrigin || event.source !== target) return;
    const data = event.data ?? {};
    if (data.type === 'osionos-ide/ready' || data.type === 'osionos-ide/need-session') {
      nonce = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
      target.postMessage({ type: 'osionos-ide/hello', nonce }, ideOrigin);
    }
    if (data.type === 'osionos-ide/identity') {
      const answer = await (await fetch('/token', { method: 'POST', body: JSON.stringify({ nonce, sig: data.sig, machineId: data.machineId }) })).json();
      window.__ide.identity = answer.identity;
      if (answer.token) target.postMessage({ type: 'osionos-ide/session', token: answer.token }, ideOrigin);
    }
    if (data.type === 'osionos-ide/state') window.__ide.states.push(data.state);
  });
</script>`;

/** The app page and the bridge's two steps: identity (the whoami signature) then the token. */
function startApp(ideUrl, machinePublicKey) {
	const server = http.createServer((req, res) => {
		if (req.url !== '/token') {
			res.writeHead(200, { 'content-type': 'text/html' });
			return res.end(APP_PAGE(ideUrl));
		}
		let body = '';
		req.on('data', (chunk) => { body += chunk; });
		req.on('end', () => {
			const { nonce, sig, machineId } = JSON.parse(body);
			const verified = machineId === MACHINE && verifyMessage(machinePublicKey, whoamiMessage({ origin: BRIDGE, machineId, ideOrigin: IDE_ORIGIN, nonce }), sig);
			const minted = verified ? signMachineToken({ sub: OWNER, machine: MACHINE, aud: IDE_ORIGIN, seed: SEED }) : null;
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ identity: verified, token: minted?.token ?? null }));
		});
	});
	return new Promise((resolve) => server.listen(APP_PORT, '127.0.0.1', () => resolve({ close: () => new Promise((done) => server.close(done)) })));
}

async function until(probe, ms, what) {
	const end = Date.now() + ms;
	while (Date.now() < end) { if (await probe()) return; await new Promise((resolve) => setTimeout(resolve, 250)); }
	throw new Error(`timed out waiting for ${what}`);
}

test('a paired machine opens its home folder after the identity check, with a bridge-signed token', { skip: READY ? false : 'OSIONOS_SERVER_LIB or dist-ide missing', timeout: 240_000 }, async (t) => {
	const { chromium } = await import('playwright');
	const root = tempRoot();
	makeFolder(root);
	const { privateKey, publicKeyRaw } = generateAgentKeyPair();
	mkdirSync(join(root, '.osionos'), { recursive: true, mode: 0o700 });
	saveMachine(join(root, '.osionos', 'machine.json'), {
		machineId: MACHINE, ownerId: OWNER, accountEmail: 'owner@example.com', bridgeUrl: BRIDGE,
		bridgeKeys: { [KEY.kid]: KEY.publicKey }, privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
	});
	// Like the live node: the web app and the desktop app. A browser cannot post to app://, and the
	// window must still reach the web app that opened it.
	const node = await startPairedNode({ serverLib: SERVER_LIB, home: root, idePort: IDE_PORT, appOrigin: APP_ORIGIN, extraAppOrigins: ['app://osionos'], machineId: MACHINE });
	const app = await startApp(`${IDE_ORIGIN}/?node=${MACHINE}`, publicKeyRaw);
	const browser = await chromium.launch({ executablePath: process.env.OSIONOS_E2E_CHROME || undefined, args: ['--no-proxy-server'] });
	t.after(async () => { await browser.close(); await app.close(); await node.stop(); rmSync(root, { recursive: true, force: true }); });

	const context = await browser.newContext({ viewport: { width: 1320, height: 860 } });
	const page = await context.newPage();
	const trail = [];
	await page.goto(`${APP_ORIGIN}/`);
	const [ide] = await Promise.all([context.waitForEvent('page'), page.click('#open')]);
	ide.on('console', (message) => { if (message.type() === 'error') trail.push(`console: ${message.text()}`); });
	ide.on('response', (response) => { if (response.status() >= 400) trail.push(`${response.status()} ${new URL(response.url()).pathname}`); });
	const status = () => ide.locator('#status').textContent().catch(() => '?');
	await until(() => page.evaluate(() => window.__ide.states.includes('connected')), 90_000, 'the machine to connect')
		.catch(async (error) => { throw new Error(`${error.message}; status "${await status()}"; ${trail.join(' | ')}\n${node.log().slice(-800)}`); });
	assert.equal(await page.evaluate(() => window.__ide.identity), true, 'the whoami signature verified with the machine key');

	const tree = ide.locator('#explorer');
	await tree.getByRole('treeitem', { name: 'proj' }).click({ timeout: 30_000 });
	await tree.getByRole('treeitem', { name: 'app.py' }).waitFor({ timeout: 15_000 });
	assert.match(await ide.title(), new RegExp(`· ${MACHINE}$`));
});
