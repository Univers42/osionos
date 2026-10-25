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
