/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-tasks.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Tasks (`GET /api/tasks`) + a due-date reminder scan. Tasks are the owner's
 * to_do blocks, indexed server-side by the osionos_pages trigger
 * (osionos-tasks-migration.sql). The scan inserts a `task_due` notification
 * (channel_id overloaded to the page id — no FK) and pushes it, deduped per
 * (user, page) per 20h. Reads are owner-scoped (RLS is own-row on top).
 */

import { bearerToken, rest, sendJson } from './bridge-social-core.mjs';
import { pushToUser } from './bridge-push.mjs';

const HOUR = 3600 * 1000;

function taskEntry(row) {
	return { pageId: row.page_id, blockId: row.block_id, workspaceId: row.workspace_id, content: row.content, checked: row.checked, dueAt: row.due_at ?? null };
}

async function listTasks(deps, session, url, response, config) {
	const due = url.searchParams.get('due') || 'all';
	const now = Date.now();
	let path = `osionos_tasks?owner_id=eq.${session.userId}&checked=eq.false&select=*&order=due_at.asc.nullslast&limit=500`;
	if (due === 'overdue') path += `&due_at=lt.${new Date(now).toISOString()}`;
	else if (due === 'today') path += `&due_at=not.is.null&due_at=lte.${new Date(now + 24 * HOUR).toISOString()}`;
	else if (due === 'week') path += `&due_at=not.is.null&due_at=lte.${new Date(now + 7 * 24 * HOUR).toISOString()}`;
	const rows = await rest(config, deps.fetchImpl, path);
	return sendJson(response, 200, { ok: true, tasks: (Array.isArray(rows) ? rows : []).map(taskEntry) }, config);
}

/** One pass: notify + push each owner about a page with a task due in [-7d, +24h]. */
async function scanDueReminders(config, fetchImpl) {
	const now = Date.now();
	const soon = new Date(now + 24 * HOUR).toISOString();
	const floor = new Date(now - 7 * 24 * HOUR).toISOString();
	const cutoff = new Date(now - 20 * HOUR).toISOString();
	const rows = await rest(config, fetchImpl,
		`osionos_tasks?checked=eq.false&due_at=not.is.null&due_at=lte.${soon}&due_at=gte.${floor}&select=page_id,owner_id,content&order=due_at.asc`).catch(() => []);
	const seen = new Set();
	for (const task of Array.isArray(rows) ? rows : []) {
		if (!task.owner_id) continue;
		const key = `${task.owner_id}:${task.page_id}`;
		if (seen.has(key)) continue; // at most one reminder per page per scan
		seen.add(key);
		const recent = await rest(config, fetchImpl,
			`osionos_notifications?user_id=eq.${task.owner_id}&channel_id=eq.${task.page_id}&type=eq.task_due&created_at=gte.${cutoff}&select=id&limit=1`).catch(() => []);
		if (Array.isArray(recent) && recent.length > 0) continue;
		const preview = `Task due: ${String(task.content || 'Untitled task').slice(0, 80)}`;
		await rest(config, fetchImpl, 'osionos_notifications', {
			method: 'POST',
			body: { user_id: task.owner_id, type: 'task_due', channel_id: task.page_id, preview },
			prefer: 'return=minimal',
		}).catch(() => {});
		await pushToUser(config, fetchImpl, task.owner_id, JSON.stringify({ title: 'Task due', body: preview, url: '/' }));
	}
}

// ponytail: one global 15-min scan (unref'd so it never blocks tests/shutdown).
// A per-user cron beats this only past ~thousands of open dated tasks.
let reminderTimer = null;
function startReminderScan(config, fetchImpl, env) {
	if (reminderTimer || env.OSIONOS_TASK_REMINDERS === '0') return;
	reminderTimer = setInterval(() => { void scanDueReminders(config, fetchImpl); }, 15 * 60 * 1000);
	if (reminderTimer.unref) reminderTimer.unref();
}

/** Build the /api/tasks dispatcher + start the reminder scan. */
export function createTasksHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl };
	startReminderScan(config, fetchImpl, env);
	return async function handleTasksRoute(url, request, response, requestConfig = config) {
		if (url.pathname !== '/api/tasks') return false;
		if ((request.method || 'GET').toUpperCase() !== 'GET') return sendJson(response, 404, { ok: false, message: 'Tasks route not found.' }, requestConfig);
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			return await listTasks(deps, session, url, response, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Tasks request failed.' }, requestConfig);
		}
	};
}
