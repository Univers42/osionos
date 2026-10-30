/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   artifact.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A server artifact is used only after its bytes match the pinned digest (C3, A-series):
// checked on the machine that unpacks it, before tar ever reads it.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function sha256File(path) {
	return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function verifyArtifact(path, expected) {
	if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error(`pinned sha256 is malformed: ${expected}`);
	const actual = sha256File(path);
	if (actual !== expected) throw new Error(`sha256 mismatch for ${path}: expected ${expected}, got ${actual}`);
	return actual;
}
