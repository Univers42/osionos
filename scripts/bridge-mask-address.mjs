/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-mask-address.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One masking rule for an email address, shared by the bridge's answers and `osionos-node status`
// (devil 2026-11-27, TB23), so the connector never imports the bridge's request stack.

/**
 * The masked form of an address: the first character of the local part, the first
 * character of the first domain label, and the last label — `dylan@gmail.com` reads
 * `d•••@g•••.com`. An address with no dot after the `@` has no last label.
 */
export function maskAddress(value) {
	const address = String(value ?? '').trim();
	const at = address.lastIndexOf('@');
	if (at < 1) return '•••';
	const labels = address.slice(at + 1).split('.');
	const first = labels[0] ?? '';
	const last = labels.length > 1 ? labels[labels.length - 1] : '';
	return `${address.slice(0, 1)}•••@${first.slice(0, 1)}•••${last ? `.${last}` : ''}`;
}
