/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fs-roots.mjs                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The folders the person opened in the editor (devil verdict 2026-11-01 editor on disk, F9; groot ADR
// 0044): `~/.osionos/roots.json`, mode 0600, rewritten whole through a temp file and a rename. Each is
// its realpath, bound to the app origin whose frame added it: a folder opened under production is not
// listed under the beta. It is added only by a click in the node's own picker, never by the app. The
// file goes with the machine's identity: on the heartbeat's 410, a re-pair, and a revoke.
import { randomBytes } from 'node:crypto';
import { readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { fsFail } from './fs-errors.mjs';
import { rootRefusal } from './fs-confine.mjs';

export const MAX_ROOTS = 32;

const isRecord = (value) => value && typeof value.id === 'string' && typeof value.realpath === 'string' && typeof value.appOrigin === 'string' && Number.isSafeInteger(value.addedAt);

export function createRootStore({ file, home, nodeHome, now = Date.now, newId = () => randomBytes(8).toString('hex') }) {
	// One write at a time: two adds racing would each rewrite the file from a stale list.
	let chain = Promise.resolve();
	const serial = (task) => { const next = chain.then(task, task); chain = next.catch(() => {}); return next; };

	async function load() {
		const text = await readFile(file, 'utf8').catch(() => null);
		let parsed = null;
		try { parsed = text === null ? null : JSON.parse(text); } catch { parsed = null; }
		return Array.isArray(parsed?.roots) ? parsed.roots.filter(isRecord).slice(0, MAX_ROOTS) : [];
	}

	async function save(roots) {
		const temp = join(dirname(file), `.roots.${randomBytes(6).toString('hex')}.tmp`);
		await writeFile(temp, `${JSON.stringify({ roots }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
		await rename(temp, file);
	}

	/** The roots this app origin added, each re-checked: one whose path is now a symlink is left out. */
	async function list(appOrigin) {
		const mine = (await load()).filter((root) => root.appOrigin === appOrigin);
		const checked = await Promise.all(mine.map(async (root) => ((await realpath(root.realpath).catch(() => null)) === root.realpath ? root : null)));
		return checked.filter(Boolean);
	}

	const add = (absolute, appOrigin) => serial(async () => {
		const real = await realpath(absolute).catch((error) => { throw fsFail(error); });
		if (await rootRefusal(real, { home, nodeHome })) throw fsFail('PermissionDenied');
		const roots = await load();
		const existing = roots.find((root) => root.realpath === real && root.appOrigin === appOrigin);
		if (existing) return existing;
		if (roots.length >= MAX_ROOTS) throw fsFail('NoSpace');
		const record = { id: newId(), realpath: real, appOrigin, addedAt: now() };
		await save([...roots, record]);
		return record;
	});

	const remove = (id, appOrigin) => serial(async () => {
		const roots = await load();
		const kept = roots.filter((root) => !(root.id === id && root.appOrigin === appOrigin));
		if (kept.length !== roots.length) await save(kept);
	});

	return { list, add, remove, file, forget: () => serial(() => rm(file, { force: true })) };
}
