/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   wire-credentials.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The credential shapes /api/pty and /api/fs both read (pty-wire.mjs, fs-wire.mjs): one copy, so
// the two openings cannot drift apart (devil verdict 2026-11-27, TB1).

// The bridge-signed machine token only (scripts/ide-machine-protocol.mjs): the shared-secret
// osionos_ide1 token opens nothing here (W3).
export const MACHINE_TOKEN = /^osionos_mc1\.[a-z2-7]{8}\.[A-Za-z0-9_-]{1,4000}\.[A-Za-z0-9_-]{1,200}$/;
export const RESUME_ASSERTION = /^osionos_mr1\.[a-z2-7]{8}\.[A-Za-z0-9_-]{1,4000}\.[A-Za-z0-9_-]{1,200}$/;
// 32 random bytes, base64url without padding: the session secret and the device secret alike.
export const SESSION_SECRET = /^[A-Za-z0-9_-]{43}$/;

export function parseObject(text) {
	let value;
	try { value = JSON.parse(text); } catch { return null; }
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export const hasExactly = (value, keys) => {
	const own = Object.keys(value);
	return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
};
