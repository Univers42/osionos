// How `osionos <path>` reaches the running node: a Unix socket under ~/.osionos, mode 600 through
// its directory, one JSON line each way. No port, so nothing but this user can ask it anything, and
// all it can do is open a folder through the same root store and refusals as the picker. This is the
// one recorded departure from verdict F9 ("only by click in the frame's picker"): F9 keeps a remote
// app from choosing folders, and this caller is the machine's own user at the machine's own shell.
// Caveat: a node killed with -9 leaves the socket file behind; the next start removes it, and until
// then a request fails with "not running", which is true.
import { chmodSync, mkdirSync, rmSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const MAX_REQUEST_BYTES = 8192;
const ANSWER_TIMEOUT_MS = 3000;

export const controlFile = (env) => join(env.HOME ?? homedir(), '.osionos', 'run', 'control.sock');

export function startControlSocket({ file, onOpen }) {
	// Absolute: `osionos .` is resolved by the CLI, whose cwd is the one the person means.
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	rmSync(file, { force: true });
	const server = createServer((socket) => {
		let text = '';
		socket.on('error', () => socket.destroy());
		socket.on('data', (chunk) => {
			text += chunk.toString('utf8');
			if (Buffer.byteLength(text) > MAX_REQUEST_BYTES) return socket.destroy();
			if (!text.includes('\n')) return;
			try {
				const { path } = JSON.parse(text);
				Promise.resolve(onOpen(path)).then(
					(answer) => socket.end(`${JSON.stringify(answer)}\n`),
					(error) => socket.end(`${JSON.stringify({ refused: error.code ?? error.message })}\n`),
				);
			} catch {
				socket.destroy();
			}
		});
	});
	server.on('error', (error) => console.error(`osionos-node: no control socket: ${error.message}`));
	server.listen(file, () => chmodSync(file, 0o600));
	return { close: () => { server.close(); rmSync(file, { force: true }); } };
}

export function requestFolder(file, path) {
	return new Promise((resolve, reject) => {
		const socket = connect(file);
		let text = '';
		const notRunning = () => reject(new Error('osionos-node is not running on this computer. Run the install command from the app.'));
		// Caveat: a node stuck past 3 s reads as "not running"; the folder may still appear in the app.
		const timer = setTimeout(() => { socket.destroy(); notRunning(); }, ANSWER_TIMEOUT_MS);
		socket.on('connect', () => socket.write(`${JSON.stringify({ path })}\n`));
		socket.on('data', (chunk) => { text += chunk.toString('utf8'); });
		socket.on('error', () => { clearTimeout(timer); notRunning(); });
		socket.on('end', () => {
			clearTimeout(timer);
			try { resolve(JSON.parse(text)); } catch { notRunning(); }
		});
	});
}
