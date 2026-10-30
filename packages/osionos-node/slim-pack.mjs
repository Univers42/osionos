/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slim-pack.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Repacks the upstream server without the built-ins osionos replaces (Copilot, Mermaid preview),
// reproducibly: sorted entries, fixed mtime and owner, gzip without a timestamp, so the same
// input always gives the same digest to pin.
// Caveat: needs GNU tar (`--sort=name`); it runs on the Linux build host, never on a target.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SERVER_PIN } from './pin.mjs';
import { sha256File } from './artifact.mjs';

export function hasGnuTar() {
	try {
		return execFileSync('tar', ['--version'], { encoding: 'utf8' }).includes('GNU tar');
	} catch {
		return false;
	}
}

export function packSlimServer({ libDir, outFile, pin = SERVER_PIN }) {
	// Busybox and BSD tar reject the flags below, and a pipe would hide that behind gzip's exit.
	if (!hasGnuTar()) throw new Error('the slim server pack needs GNU tar (busybox and BSD tar lack --sort)');
	for (const name of pin.server.requireBuiltins) {
		if (!existsSync(join(libDir, 'vscode', 'extensions', name))) throw new Error(`required built-in missing: ${name}`);
	}
	const excludes = pin.server.removeBuiltins.map((name) => `--exclude=vscode/extensions/${name}`);
	const tar = ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', ...excludes, '-cf', '-', 'vscode', 'node'];
	execFileSync('sh', ['-c', 'set -o pipefail; tar "$@" | gzip -n -9 > "$OUT"', 'tar', ...tar], { cwd: libDir, env: { ...process.env, OUT: outFile } });
	return { file: outFile, sha256: sha256File(outFile) };
}
