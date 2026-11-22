/**
 * A run whose model ended without one word of answer is a failed run, never a
 * `done` with nothing in it.
 *
 * Before this, such a run was stored as `succeeded` and the reader saw the
 * stream stop with no answer and no error (live 2026-11-22: a reasoning model
 * spent its whole output on reasoning, finish `length`, not one text delta).
 * The code says what happened, so the pane can say what to do.
 *
 * A run that asked the user for the right to write (finish
 * `awaiting_approval`) has its answer in the card: it is not empty.
 */

export type EmptyAnswerCode = 'answer_cut_off' | 'answer_filtered' | 'empty_answer';

/** The end of a run with no answer: the code it ends on. */
export class EmptyAnswer extends Error {
	readonly code: EmptyAnswerCode;

	constructor(code: EmptyAnswerCode) {
		super(code);
		this.name = 'EmptyAnswer';
		this.code = code;
	}
}

/** The code of an answer that is empty, by why the model stopped; null when there is an answer. */
export function emptyAnswerCode(answer: string, finishReason: string): EmptyAnswerCode | null {
	if (finishReason === 'awaiting_approval' || answer.trim().length > 0) return null;
	if (finishReason === 'length') return 'answer_cut_off';
	if (finishReason === 'content-filter') return 'answer_filtered';
	return 'empty_answer';
}
