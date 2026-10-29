/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   docker-run-calls.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Every command scripts/docker-run.sh runs for a target, as argv arrays (program name
// first): a fake of each of `programs` first on PATH records one call per line, and
// OSIONOS_IN_DOCKER=1 skips the container hop. Arguments are split on \x1f, so one that
// contains it would be split too.

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export function dockerRunCalls(target, args, programs = ['node']) {
	const bin = mkdtempSync(join(tmpdir(), 'docker-run-argv-'));
	try {
		for (const program of programs) {
			writeFileSync(join(bin, program), '#!/bin/sh\nprintf "%s\\037" "${0##*/}" "$@"\nprintf "\\n"\n');
			chmodSync(join(bin, program), 0o755);
		}
		const out = execFileSync('/bin/bash', ['scripts/docker-run.sh', target, ...args], {
			cwd: APP_ROOT,
			env: { ...process.env, OSIONOS_IN_DOCKER: '1', PATH: `${bin}:${process.env.PATH}` },
			encoding: 'utf8',
		});
		return out.split('\n').filter(Boolean).map((line) => line.split('\x1f').slice(0, -1));
	} finally {
		rmSync(bin, { recursive: true, force: true });
	}
}
