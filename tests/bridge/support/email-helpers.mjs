/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   email-helpers.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Small readers shared by the secondary-email suites: what the world holds, in comparable form. */

import { hmacOf, openAddress } from '../../../scripts/bridge-account-email-rows.mjs';

export const VERIFIED_AT = '2026-10-01T00:00:00Z';
export const NEVER = () => new Promise(() => {});

/** A row the caller added and a mailbox proved: the add runs through the real route. */
export async function addVerified(world, userId, address) {
	await world.add(userId, address);
	await world.drain();
	const row = world.table.rows.find((entry) => entry.user_id === userId && entry.email_hmac === hmacOf(address, world.env));
	row.verified_at = VERIFIED_AT;
	return row;
}

/** A promise a test settles by hand, to hold grobase or the GoTrue list mid-flight. */
export function gate() {
	let open;
	const promise = new Promise((resolve) => { open = resolve; });
	return { promise, open };
}

/** The send counters with the per-target keys folded, so two worlds compare by shape not by hash. */
export function counterShape(kv) {
	const shape = { targets: [] };
	for (const [key, value] of kv.values) {
		if (!key.includes('email-')) continue;
		if (key.includes('email-target')) shape.targets.push(Number(value));
		else shape[key.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, 'U')] = Number(value);
	}
	shape.targets.sort((left, right) => left - right);
	return shape;
}

/** What an observer of the answer sees: status, body keys, the mask and every header. */
export const observable = (result) => JSON.stringify([result.status, Object.keys(result.body).sort((left, right) => left.localeCompare(right)), result.body.sentTo, Object.entries(result.headers).filter(([name]) => name !== 'content-length')]);
export const addressOf = (world, row) => openAddress(row, world.env);
