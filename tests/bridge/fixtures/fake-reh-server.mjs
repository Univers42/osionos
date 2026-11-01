// Stands in for VS Code's server-main.js: listens on --socket-path and writes what it was
// started with (argv, the env keys that matter, its umask) next to the socket.
import { createServer } from 'node:net';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const socketPath = argv[argv.indexOf('--socket-path') + 1];
writeFileSync(`${socketPath}.started.json`, JSON.stringify({
	argv,
	shell: process.env.SHELL,
	host: process.env.VSCODE_SERVER_HOST ?? null,
	port: process.env.VSCODE_SERVER_PORT ?? null,
	umask: process.umask(),
}));
createServer((socket) => socket.end('ok')).listen(socketPath);
