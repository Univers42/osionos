/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-no-second-erase.test.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Erasure lives in ONE SQL function. The legacy anonymise functions must never be
 * called from the bridge or the app, or two erasers would disagree about what a
 * deleted account is. The names are built by concatenation so this file is not a hit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = ['gdpr' + '_', 'anonymise' + '_user'];
const ROOTS = ['scripts', 'src'];

function* sources(dir) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			if (name !== 'notion-database-sys') yield* sources(path);
		} else if (/\.(mjs|js|ts|tsx)$/.test(name)) yield path;
	}
}

test('no legacy erase function is referenced from scripts/ or src/', () => {
	const hits = [];
	for (const root of ROOTS) {
		for (const path of sources(root)) {
			const text = readFileSync(path, 'utf8');
			for (const word of FORBIDDEN) if (text.includes(word)) hits.push(`${path}: ${word}`);
		}
	}
	assert.deepEqual(hits, []);
});
