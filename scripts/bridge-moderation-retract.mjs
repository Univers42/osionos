/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-moderation-retract.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The retraction event of the L1 classifier (#72). The AI service holds a feed
 * comment AFTER it was published, in its own database transaction, and it has no
 * realtime publish key: only the bridge does. So the bridge follows the append-only
 * audit table and publishes `feed_comment_held` on the comment's feed topic. The
 * open feeds read the page's comments again, and the read filter
 * (visibleOrOwnFilter) hides the held one from everyone but its author.
 * The payload carries no userId, so no client drops it as its own echo.
 * Page comments have no live channel, so a hold there shows on the next load.
 *
 * Caveat: under-reports. A hold written while the bridge is down, or a row whose
 * transaction commits after a higher id was already read (two L1 workers racing),
 * is never retracted live; the comment still disappears on the next feed load.
 * Each replica publishes on its own, so two replicas send the event twice, and the
 * second refresh reads the same rows.
 */

import { inFilter } from './bridge-paging.mjs';
import { moderationSettings, publishRealtime, rest } from './bridge-social-core.mjs';

const POLL_INTERVAL_MS = 5_000;
const BATCH = 100;

/** One tick reads the holds after the cursor; the first tick only places the cursor. */
export function createModerationRetractor({ config, fetchImpl, env = process.env, publish = publishRealtime }) {
	let cursor = null;
	async function heldComments(ids) {
		const rows = await rest(config, fetchImpl, `osionos_feed_comments?select=id,page_id&moderation_state=eq.held&${inFilter('id', ids)}`);
		return new Map((rows ?? []).map((row) => [row.id, row.page_id]));
	}
	async function tick() {
		if (cursor === null) {
			const last = await rest(config, fetchImpl, 'ai_moderation_events?select=id&order=id.desc&limit=1');
			cursor = Number(last?.[0]?.id ?? 0);
			return;
		}
		const rows = await rest(config, fetchImpl, `ai_moderation_events?select=id,subject_id,workspace_id&layer=eq.l1&action=eq.hold&subject_kind=eq.feed_comment&id=gt.${cursor}&order=id.asc&limit=${BATCH}`) ?? [];
		if (rows.length === 0) return;
		const held = await heldComments([...new Set(rows.map((row) => row.subject_id))]);
		const sent = new Set();
		for (const row of rows) {
			const pageId = held.get(row.subject_id);
			const key = `${row.workspace_id}/${pageId}`;
			if (!pageId || !row.workspace_id || sent.has(key)) continue;
			sent.add(key);
			await publish({ topic: `feed:${row.workspace_id}`, eventType: 'feed_comment_held', payload: { pageId, kind: 'comment_held' }, fetchImpl, env });
		}
		cursor = Number(rows.at(-1).id);
	}
	return { tick };
}

/** Starts the setTimeout chain, or returns null when the state column is off. */
export function startModerationRetractPoller({ config, fetchImpl, env = process.env, intervalMs = POLL_INTERVAL_MS }) {
	if (!moderationSettings(env).stateEnabled) return null;
	const retractor = createModerationRetractor({ config, fetchImpl, env });
	let timer = null;
	let stopped = false;
	async function run() {
		try {
			await retractor.tick();
		} catch (error) {
			console.warn(`[osionos-bridge] moderation retraction skipped: ${error instanceof Error ? error.message : 'unreachable'}`);
		}
		if (stopped) return;
		timer = setTimeout(run, intervalMs);
		timer.unref();
	}
	void run();
	return { tick: retractor.tick, stop() { stopped = true; clearTimeout(timer); } };
}
