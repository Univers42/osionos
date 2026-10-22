#!/usr/bin/env node
/**
 * The policy of the gate, measured on the verdicts A1 recorded.
 *
 * The file is `spikes/a1/results/safety/guard-0.6b/verdicts.tsv`: one row per
 * prompt, with the set, the row, the language, the verdict of the guard, the
 * codes of its categories and the wall time of the call. NO GUARD IS CALLED
 * HERE: the script applies the policy of `src/images/guardPolicy.ts` — the
 * very one the service uses — to the verdicts the spike recorded, so the
 * numbers are the numbers of the policy, not of a model.
 *
 * The interval is the Wilson 95 % one: the rate of a refusal on a set of rows
 * whose labels are NOT the slice's labels (I2P labels the image Stable
 * Diffusion made, not the prompt) is a number with a wide interval, and the
 * interval says so.
 *
 * usage: node --experimental-strip-types scripts/gate-eval.mjs
 */

import { readFileSync } from 'node:fs';
import { guardRefuses } from '../src/images/guardPolicy.ts';

const VERDICTS = new URL('../spikes/a1/results/safety/guard-0.6b/verdicts.tsv', import.meta.url);

/** The rows of the file: the set, the row, the language, the verdict, the codes. */
function readRows() {
	const rows = [];
	for (const line of readFileSync(VERDICTS, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		const [set, row, lang, verdict, codes] = line.split('\t');
		rows.push({
			set,
			row,
			lang,
			// A verdict the file does not know is an answer nobody read: the
			// policy refuses it, as it refuses a broken answer.
			verdict: ['Safe', 'Unsafe', 'Controversial'].includes(verdict) ? verdict : 'unparsed',
			codes: (codes ?? '').split(',').filter((code) => code.length > 0),
		});
	}
	return rows;
}

/** The Wilson 95 % interval of a rate. */
function wilson(refused, rows, z = 1.959964) {
	if (rows === 0) return [0, 0];
	const p = refused / rows;
	const denominator = 1 + (z * z) / rows;
	const centre = (p + (z * z) / (2 * rows)) / denominator;
	const margin = (z * Math.sqrt((p * (1 - p)) / rows + (z * z) / (4 * rows * rows))) / denominator;
	return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

/** The percent, with one decimal. */
const percent = (value) => `${(value * 100).toFixed(2)} %`;

const sets = new Map();
for (const row of readRows()) {
	const entry = sets.get(row.set) ?? { rows: 0, refused: 0 };
	entry.rows += 1;
	if (guardRefuses({ verdict: row.verdict, codes: row.codes })) entry.refused += 1;
	sets.set(row.set, entry);
}

console.log('the policy of the gate on the verdicts of A1 (Qwen3Guard-Gen-0.6B)');
console.log('');
console.log('set        rows  refused  rate       wilson 95 %');
for (const [set, entry] of sets) {
	const [low, high] = wilson(entry.refused, entry.rows);
	console.log(
		`${set.padEnd(10)} ${String(entry.rows).padStart(5)} ${String(entry.refused).padStart(8)}  ${percent(entry.refused / entry.rows).padStart(9)}  [${percent(low)}, ${percent(high)}]`,
	);
}
const rows = [...sets.values()].reduce((total, entry) => total + entry.rows, 0);
const refused = [...sets.values()].reduce((total, entry) => total + entry.refused, 0);
const [low, high] = wilson(refused, rows);
console.log('');
console.log(`all        ${String(rows).padStart(5)} ${String(refused).padStart(8)}  ${percent(refused / rows).padStart(9)}  [${percent(low)}, ${percent(high)}]`);
