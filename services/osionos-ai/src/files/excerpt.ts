/**
 * The part of a text file that goes into the prompt.
 *
 * A file up to the budget is quoted whole. A longer one is cut to windows
 * picked for the question by BM25 and put back in document order.
 *
 * Caveat: BM25 is lexical. A question worded unlike the file ("the money
 * part" for a column called `amount`) misses the right window, and a file
 * that is all one repeated token ranks every window the same. The excerpt is
 * flagged `excerpt="true"` so the model knows it saw a part.
 */

export const FILE_CHARS = 24_000;
export const FILES_TOTAL_CHARS = 60_000;
const WINDOW = 1_500;
const OVERLAP = 200;
const K1 = 1.2;
const B = 0.75;
const JOINER = '\n…\n';

export interface Excerpt {
	text: string;
	excerpt: boolean;
	windowsUsed: number;
	windowsTotal: number;
}

function tokens(text: string): string[] {
	return text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
}

/** BM25 score of each window for the query terms. */
function scoreWindows(windows: readonly string[], query: readonly string[]): number[] {
	const docs = windows.map((window) => {
		const counts = new Map<string, number>();
		const words = tokens(window);
		for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
		return { counts, length: words.length };
	});
	const average = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length || 1;
	const terms = [...new Set(query)];
	return docs.map((doc) => {
		let score = 0;
		for (const term of terms) {
			const frequency = doc.counts.get(term) ?? 0;
			if (frequency === 0) continue;
			const containing = docs.filter((other) => other.counts.has(term)).length;
			const idf = Math.log(1 + (docs.length - containing + 0.5) / (containing + 0.5));
			score += (idf * frequency * (K1 + 1)) / (frequency + K1 * (1 - B + (B * doc.length) / average));
		}
		return score;
	});
}

export function excerptForQuestion(text: string, question: string, budgetChars: number): Excerpt {
	if (text.length <= budgetChars) return { text, excerpt: false, windowsUsed: 1, windowsTotal: 1 };
	const step = WINDOW - OVERLAP;
	const windows: string[] = [];
	for (let start = 0; start < text.length; start += step) {
		windows.push(text.slice(start, start + WINDOW));
		if (start + WINDOW >= text.length) break;
	}
	const scores = scoreWindows(windows, tokens(question));
	// Best score first; the earlier window wins a tie, so a question that
	// matches nothing reads the start of the file.
	const ranked = windows.map((_, index) => index).sort((a, b) => scores[b] - scores[a] || a - b);
	const chosen: number[] = [];
	let used = 0;
	for (const index of ranked) {
		const cost = windows[index].length + (chosen.length > 0 ? JOINER.length : 0);
		if (used + cost > budgetChars) continue;
		chosen.push(index);
		used += cost;
	}
	chosen.sort((a, b) => a - b);
	return {
		text: chosen.map((index) => windows[index]).join(JOINER),
		excerpt: true,
		windowsUsed: chosen.length,
		windowsTotal: windows.length,
	};
}

export interface FileToFit {
	name: string;
	text: string;
}

export interface FittedFile extends Excerpt {
	name: string;
}

/** Every file of a run: at most `perFile` each, `total` together; later files get the remainder. */
export function fitFiles(
	files: readonly FileToFit[],
	question: string,
	perFile = FILE_CHARS,
	total = FILES_TOTAL_CHARS,
): FittedFile[] {
	let remaining = total;
	return files.map((file) => {
		const budget = Math.max(0, Math.min(perFile, remaining));
		const fitted = budget === 0 && file.text.length > 0
			? { text: '', excerpt: true, windowsUsed: 0, windowsTotal: 1 }
			: excerptForQuestion(file.text, question, budget);
		remaining -= fitted.text.length;
		return { name: file.name, ...fitted };
	});
}
