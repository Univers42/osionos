import { readFileSync, writeFileSync } from 'node:fs';

/** One row of labels.jsonl: a run's answer and verdict, and the label a reader gave it. */
export interface LabelRow {
	id: string;
	answer: string | null;
	sources: string[] | null;
	judge: { faithful: boolean; relevant: number; abstained: boolean } | null;
	human: { faithful: boolean | null; relevant: number | null };
	labeller?: string;
}

/**
 * The row after a new run. A label was given to one answer: when the run
 * writes a different answer, that label no longer applies and is cleared, so
 * calibrate.ts never compares a judge with a label of another answer.
 */
export function refreshLabel(row: LabelRow, fresh: Pick<LabelRow, 'answer' | 'sources' | 'judge'>): LabelRow {
	const answerChanged = row.answer !== null && row.answer !== fresh.answer;
	if (!answerChanged) return { ...row, ...fresh };
	const { labeller: _dropped, ...rest } = row;
	return { ...rest, ...fresh, human: { faithful: null, relevant: null } };
}

/** A run's result for one question, to merge into a label file. */
export type FreshLabel = Pick<LabelRow, 'id' | 'answer' | 'sources' | 'judge'>;

/**
 * Fill a label file with a run's rows. A row with no matching run row is left
 * exactly as it is; a matching row is refreshed, so an answer that changed
 * loses its human label. The order of the file is kept.
 */
export function fillLabelFile(filePath: string, rows: FreshLabel[]): void {
	const existing = readFileSync(filePath, 'utf8').split(/\r?\n/).filter((l) => l.trim());
	const rowMap = new Map(existing.map((l) => [JSON.parse(l).id, l]));
	for (const row of rows) {
		if (rowMap.has(row.id)) {
			const label = refreshLabel(JSON.parse(rowMap.get(row.id)!) as LabelRow, row);
			rowMap.set(row.id, JSON.stringify(label));
		}
	}
	writeFileSync(filePath, [...rowMap.values()].join('\n') + '\n', 'utf8');
}
