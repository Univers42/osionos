// Stand-ins for the web terminal's socket and pty host (devil verdict 2026-11-01): a socket with
// the slice of ws's WebSocket the node uses, and a host that records every pty call.
import { EventEmitter } from 'node:events';

export class FakeConn extends EventEmitter {
	sent = [];
	closeCode = null;
	bufferedAmount = 0;

	send(text) {
		if (this.closeCode === null) this.sent.push(JSON.parse(text));
	}

	close(code = 1005) {
		if (this.closeCode !== null) return;
		this.closeCode = code;
		queueMicrotask(() => this.emit('close', code));
	}

	receive(text, isBinary = false) {
		this.emit('message', Buffer.from(text), isBinary);
	}

	/** The peer goes away (tab closed, navigation): ws reports 1006. */
	drop() {
		this.close(1006);
	}
}

/** A host whose shells record their calls. `fail` makes the next spawns report unavailable. */
export function fakeHost() {
	const shells = [];
	const host = {
		shells,
		fail: false,
		spawned: 0,
		async spawn(size, events) {
			if (host.fail) return null;
			host.spawned += 1;
			const shell = {
				size, events, writes: [], resizes: [], acks: [], kills: 0,
				write(data) { shell.writes.push(data); },
				resize(cols, rows) { shell.resizes.push([cols, rows]); },
				ack(chars) { shell.acks.push(chars); },
				kill() { shell.kills += 1; },
			};
			shells.push(shell);
			return shell;
		},
		live: () => shells.filter((shell) => shell.kills === 0).length,
	};
	return host;
}

export const settle = () => new Promise((resolve) => setImmediate(resolve));
