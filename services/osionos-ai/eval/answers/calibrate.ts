import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cohenKappa, spearman } from './score.ts';

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const LABELS_PATH = process.argv[2] ?? path.join(EVAL_DIR, 'labels.jsonl');

interface Label {
	id: string;
	answer: string | null;
	sources: string[] | null;
	judge: { faithful: boolean; relevant: number; abstained: boolean } | null;
	human: { faithful: boolean | null; relevant: number | null };
}

function readLabels(): Label[] {
	const raw = readFileSync(LABELS_PATH, 'utf8');
	return raw
		.split(/\r?\n/)
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line));
}

function main() {
	const labels = readLabels();
	const total = labels.length;
	const labelled = labels.filter((l) => l.human.faithful !== null && l.human.relevant !== null).length;

	if (labelled < total) {
		console.log(`uncalibrated: ${labelled}/${total} labelled`);
		process.exit(0);
	}

	// All labelled: compute kappa and spearman.
	const judgeFaithful = labels.map((l) => l.judge?.faithful ?? false);
	const humanFaithful = labels.map((l) => l.human.faithful ?? false);
	const judgeRelevant = labels.map((l) => l.judge?.relevant ?? 0);
	const humanRelevant = labels.map((l) => l.human.relevant ?? 0);

	const kappa = cohenKappa(judgeFaithful, humanFaithful);
	const rho = spearman(judgeRelevant, humanRelevant);

	console.log(`kappa: ${kappa.toFixed(3)}`);
	console.log(`spearman: ${rho.toFixed(3)}`);

	if (kappa < 0.6) {
		process.exit(1);
	}
}

main();