/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-activity-vocab.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The closed event and surface vocabulary of osionos_activity_events: the one source the
 * emitter and the insights route import. The SQL CHECK lists in
 * models/osionos-activity-analytics-migration.sql must equal these; a bridge test compares them.
 */

export const ACTIVITY_EVENTS = Object.freeze(['page_open', 'page_create', 'page_edit', 'search', 'share', 'export', 'login', 'database_view']);
export const ACTIVITY_SURFACES = Object.freeze(['editor', 'database', 'canvas', 'chat', 'search', 'settings', 'admin']);

export const isActivityEvent = (value) => ACTIVITY_EVENTS.includes(value);
export const isActivitySurface = (value) => ACTIVITY_SURFACES.includes(value);
