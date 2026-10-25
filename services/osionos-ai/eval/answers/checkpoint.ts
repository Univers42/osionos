/* ************************************************************************** */
/*                                                                            */
/*   checkpoint.ts                 the answer run's checkpoint                 */
/*                                                                            */
/*   One JSON header line, then one JSON row per finished question. A run     */
/*   that is killed mid-write leaves a cut-off last line, which is dropped;   */
/*   every other bad line is an error.                                        */
/*                                                                            */
/*   Pure apart from node:fs. Node 22.                                        */
/* ************************************************************************** */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Verdict } from './judge.ts';

export interface CheckpointHeader {
	judge: string;
	llmModel: string;
	embedModel: string;
	questionCount: number;
}

export interface CheckpointRow {
	id: string;
	answer: string;
	sources: string[];
	verdict: Verdict | null;
	answerable: boolean;
	origin: string;
}

/**
 * The header as JSON with sorted keys, so a file written with another key
 * order is still the same header, but a missing or extra key is not.
 */
function headerAsJson(header: CheckpointHeader): string {
	const keys = Object.keys(header).sort();
	return JSON.stringify(keys.map((key) => [key, (header as unknown as Record<string, unknown>)[key]]));
}

/**
 * Open a checkpoint: write the header to a missing or empty file, refuse a
 * file started for another run, and return the finished rows keyed by id.
 */
export function openCheckpoint(file: string, header: CheckpointHeader): Map<string, CheckpointRow> {
	const rows = new Map<string, CheckpointRow>();
	const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
	if (existing.trim().length === 0) {
		writeFileSync(file, JSON.stringify(header) + '\n', 'utf8');
		return rows;
	}

	const lines = existing.split('\n');
	let stored: CheckpointHeader;
	try {
		stored = JSON.parse(lines[0]) as CheckpointHeader;
	} catch {
		throw new Error(
			`checkpoint ${file} has a bad header line ${JSON.stringify(lines[0])}, expected ${JSON.stringify(header)}; delete the file to start over`,
		);
	}
	if (headerAsJson(stored) !== headerAsJson(header)) {
		throw new Error(
			`checkpoint ${file} was started with ${JSON.stringify(stored)}, but this run needs ${JSON.stringify(header)}; delete the file to start over`,
		);
	}

	// A killed append leaves the last line without its newline: drop that line
	// when it is not valid JSON. A bad line anywhere else is a real error.
	const cutOff = !existing.endsWith('\n');
	const lastIndex = lines.length - 1;
	for (let index = 1; index < lines.length; index++) {
		const line = lines[index];
		if (line.length === 0) continue;
		try {
			const row = JSON.parse(line) as CheckpointRow;
			rows.set(row.id, row);
		} catch {
			if (cutOff && index === lastIndex) break;
			throw new Error(`checkpoint ${file} has a bad row on line ${index + 1}: ${line}`);
		}
	}
	return rows;
}

/** Append one finished question. */
export function appendCheckpoint(file: string, row: CheckpointRow): void {
	appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
}
