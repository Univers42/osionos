import { writeFileSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import { startMockUpstream } from '../tests/mockUpstream.ts';

const shared = process.env.LOAD_SHARED_DIR ?? '/shared';
mkdirSync(shared, { recursive: true });

const mock = await startMockUpstream({
	preDelayMs: 300,
	chunkCount: 100,
	chunkGapMs: 200,
});

// The mock listens on 127.0.0.1 inside its container, which no other
// container can reach. Bridge it to 0.0.0.0 on a fixed port.
const upstreamUrl = new URL(mock.baseUrl);
const upstreamPort = Number(upstreamUrl.port);
const PROXY_PORT = 4000;
const proxy = net.createServer((socket) => {
	const upstream = net.connect(upstreamPort, '127.0.0.1');
	socket.pipe(upstream);
	upstream.pipe(socket);
	socket.on('error', () => upstream.destroy());
	upstream.on('error', () => socket.destroy());
});
proxy.listen(PROXY_PORT, '0.0.0.0');

writeFileSync(`${shared}/mock.url`, `http://mock:${PROXY_PORT}`);
console.log(JSON.stringify({ event: 'mock_listening', baseUrl: `http://mock:${PROXY_PORT}`, upstream: mock.baseUrl }));

process.on('SIGTERM', async () => {
	proxy.close();
	await mock.close();
	process.exit(0);
});
process.on('SIGINT', async () => {
	proxy.close();
	await mock.close();
	process.exit(0);
});

setInterval(() => {}, 60_000);