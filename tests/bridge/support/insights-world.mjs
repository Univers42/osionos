/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-insights-world.mjs                          +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The insights route over the keyset store with a seeded rollup: dates are relative to now so
 * the "last N closed UTC days" window always holds the fixture. The OSIONOS_ACTIVITY flag is
 * set for the life of the test and restored after.
 */

import { ROLE_IDS, roleTables, startAdminWorld, tokenFor } from './admin-route-world.mjs';
import { USER_A, USER_B } from './account-world.mjs';

export const INSIGHTS = '/api/account/admin/insights';
export const AUDIT = 'osionos_bridge_audit_events';
export const DAILY = 'osionos_activity_daily';
export { ROLE_IDS, tokenFor, USER_A, USER_B };

const DAY_MS = 86_400_000;

export const daysAgo = (n) => new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS - n * DAY_MS).toISOString().slice(0, 10);

export const cell = (ago, event, surface, events, distinct_users) => ({ day: daysAgo(ago), event, surface, events, distinct_users });

export async function insightsWorld(t, { cells = [], grants, refuse, failReads } = {}) {
	const wasSet = Object.hasOwn(process.env, 'OSIONOS_ACTIVITY');
	const before = process.env.OSIONOS_ACTIVITY;
	process.env.OSIONOS_ACTIVITY = '1';
	t.after(() => {
		if (wasSet) process.env.OSIONOS_ACTIVITY = before;
		else delete process.env.OSIONOS_ACTIVITY;
	});
	const tables = { ...roleTables(grants), [DAILY]: cells, [AUDIT]: [] };
	return startAdminWorld(t, { path: INSIGHTS, tables, refuse, failReads });
}
