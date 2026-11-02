/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fs-watch.mjs                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Changes on disk reach the open editor (devil verdict 2026-11-01 editor on disk, F12; groot ADR
// 0044). One non-recursive watch per folder the page asks for: the folders the person expanded and
// the folders of open files, so a node_modules or .git nobody opened is never watched. Changes are
// gathered for 100 ms, then sent as the names that changed, at most ten messages a second a watch;
// more names than fit in one message become one `rescan`. A watch dies with its socket.
// Caveat: inotify's quota is per user and shared with every other program, the VS Code server's
// watcher included (measured 2026-11-01 on the owner's laptop: max_user_watches 65536,
// max_user_instances 128); 256 here leaves the rest to them, and a full quota fails a watch here
// with a notice, never the node.
// Caveat: the names are what the kernel reported in 100 ms, without the kind of change; the page
// re-reads what it shows. A rename across folders arrives as two names in two watches.
import { watch as fsWatch } from 'node:fs';

export const WATCH_LIMITS = Object.freeze({ maxWatches: 256, coalesceMs: 100, maxNames: 64 });

// The save's own temp files (fs-save.mjs) come and go on every save; they are no change to show.
const SAVE_TEMP = /\.osionos-[0-9a-f]{12}\.tmp$/;

export function createWatchHub({ watchDir = fsWatch, schedule = setTimeout, cancel = clearTimeout, limits = WATCH_LIMITS } = {}) {
	let live = 0;

	/** One socket's watches; `send` posts a message to its frame. */
	function forSocket(send) {
		let nextId = 0;
		const watches = new Map();

		function flush(id) {
			const entry = watches.get(id);
			if (!entry) return;
			entry.timer = null;
			const names = [...entry.names];
			const overflow = entry.overflow || names.length > limits.maxNames;
			entry.names.clear();
			entry.overflow = false;
			send(overflow ? { op: 'rescan', watch: id } : { op: 'changed', watch: id, names });
		}

		function note(id, name) {
			const entry = watches.get(id);
			if (!entry) return;
			if (typeof name !== 'string') entry.overflow = true;
			else if (SAVE_TEMP.test(name)) return;
			else if (entry.names.size <= limits.maxNames) entry.names.add(name);
			entry.timer ??= schedule(() => flush(id), limits.coalesceMs);
		}

		function drop(id) {
			const entry = watches.get(id);
			if (!entry) return false;
			watches.delete(id);
			if (entry.timer) cancel(entry.timer);
			try { entry.watcher.close(); } catch { /* already closed by its error */ }
			live -= 1;
			return true;
		}

		/** A watch id, or null when the node holds its maximum or the kernel refused one. */
		function add(dir) {
			if (live >= limits.maxWatches) return null;
			const id = ++nextId;
			let watcher;
			try {
				watcher = watchDir(dir, { recursive: false, persistent: false }, (_type, name) => note(id, name == null ? null : String(name)));
			} catch {
				return null;
			}
			live += 1;
			watches.set(id, { watcher, names: new Set(), overflow: false, timer: null });
			// The folder went away or the kernel gave up on it: one last rescan, and the watch ends.
			watcher.on?.('error', () => { if (drop(id)) send({ op: 'rescan', watch: id }); });
			return id;
		}

		return { add, remove: drop, closeAll: () => { for (const id of [...watches.keys()]) drop(id); }, size: () => watches.size };
	}

	return { forSocket, count: () => live };
}
