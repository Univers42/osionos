/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   harness.mjs                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The world the machine end-to-end runs in: a real osionos-node (real VS Code server, socket
// mode) and a stand-in app page that frames the IDE origin and answers its handshake the way the
// app does, with a node-scoped IDE token.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';

import { signIdeToken } from '../../scripts/ide-token.mjs';

export const SECRET = 's'.repeat(40);
export const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const WORKSPACE = 'cccccccc-3333-4333-8333-cccccccccccc';
const CLI = new URL('../../packages/osionos-node/cli.mjs', import.meta.url).pathname;
const CLIENT = new URL('../../dist-ide', import.meta.url).pathname;

export function makeFolder(base) {
	const folder = join(base, 'proj');
	mkdirSync(join(folder, '.vscode'), { recursive: true });
	writeFileSync(join(folder, 'app.py'), 'def add(a, b):\n    return a + b\n');
	// C11: a task that runs on folder open; trust must be granted before it may write this file.
	writeFileSync(join(folder, '.vscode', 'tasks.json'), JSON.stringify({
		version: '2.0.0',
		tasks: [{ label: 'sentinel', type: 'shell', command: 'touch untrusted-task-ran', runOptions: { runOn: 'folderOpen' } }],
	}));
	execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: folder });
	execFileSync('git', ['-c', 'user.email=e2e@osionos', '-c', 'user.name=e2e', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: folder });
	return folder;
}

export async function startNode({ serverLib, home, idePort, appOrigin }) {
	const child = spawn(process.execPath, [CLI, 'serve', '--node', 'laptop', '--server', serverLib, '--listen', `127.0.0.1:${idePort}`, '--app-origin', appOrigin, '--client', CLIENT], {
		env: { ...process.env, HOME: home, OSIONOS_IDE_TOKEN_SECRET: SECRET, OSIONOS_IDE_OWNER: OWNER },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let log = '';
	child.stdout.on('data', (chunk) => { log += chunk; });
	child.stderr.on('data', (chunk) => { log += chunk; });
	// Caveat: 60 s covers a cold server start on this laptop (measured 0.75 s warm); a slower
	// machine fails here with the node's own log attached, not with a broken feature.
	const deadline = Date.now() + 60_000;
	while (!log.includes('osionos-node: laptop on')) {
		if (child.exitCode !== null || Date.now() > deadline) throw new Error(`osionos-node did not start:\n${log}`);
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return { child, log: () => log, stop: () => new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGTERM'); }) };
}

// `frame` embeds the IDE page; `window` opens it as its own top-level window with a button, the
// way /machine does, since a cookie in a cross-site frame is never sent (C0-F1).
const APP_PAGE = (ideUrl, ideOrigin, mode) => `<!doctype html><title>app</title>
${mode === 'frame' ? `<iframe id="ide" src="${ideUrl}" style="width:1300px;height:820px;border:0"></iframe>` : '<button id="open">Open</button>'}
<script type="module">
  const ideOrigin = ${JSON.stringify(ideOrigin)};
  let target = ${mode === 'frame' ? "document.getElementById('ide').contentWindow" : 'null'};
  document.getElementById('open')?.addEventListener('click', () => { target = window.open(${JSON.stringify(ideUrl)}, 'osionos-machine'); });
  window.__ide = { states: [], sessions: 0 };
  async function sendSession() {
    const { token } = await (await fetch('/token')).json();
    window.__ide.sessions++;
    target.postMessage({ type: 'osionos-ide/session', token }, ideOrigin);
  }
  window.__ideOpen = (path) => target.postMessage({ type: 'osionos-ide/open', path }, ideOrigin);
  window.__ideSend = (message) => target.postMessage(message, ideOrigin);
  addEventListener('message', (event) => {
    if (event.origin !== ideOrigin || event.source !== target) return;
    const { type, state } = event.data ?? {};
    if (type === 'osionos-ide/ready' || type === 'osionos-ide/need-session') sendSession();
    if (type === 'osionos-ide/state') window.__ide.states.push(state);
  });
</script>`;

export async function startApp({ appPort, ideUrl, ideOrigin, mode = 'window' }) {
	const server = http.createServer((req, res) => {
		if (req.url === '/token') {
			const { token } = signIdeToken({ userId: OWNER, workspaceId: WORKSPACE, secret: SECRET, scope: 'node' });
			res.writeHead(200, { 'content-type': 'application/json' });
			return res.end(JSON.stringify({ token }));
		}
		res.writeHead(200, { 'content-type': 'text/html' });
		res.end(APP_PAGE(ideUrl, ideOrigin, mode));
	});
	// Bound on loopback; the test reaches it as `localhost`, another site than the IDE's 127.0.0.1.
	await new Promise((resolve) => server.listen(appPort, '127.0.0.1', resolve));
	return { close: () => new Promise((resolve) => server.close(resolve)) };
}

export function tempRoot() {
	// Short: the socket path (A1) must stay under 100 bytes.
	return mkdtempSync('/tmp/om-');
}
