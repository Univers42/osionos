/**
 * The policy of the L1 guard of the image prompt (devil C72).
 *
 * The guard is Qwen3Guard-Gen-0.6B on llama-server (A1:
 * `spikes/a1/results/safety/RESULTS.md`): it answers two lines, `Safety:
 * Safe|Unsafe|Controversial` and `Categories: …`. The parser below is the port
 * of the one of the spike (`spikes/a1/guard-client.py`, lines 28-100): the same
 * regexes, the same table of codes, the same `?` for a category the table does
 * not know.
 *
 * PURE: this file imports NOTHING, so the evaluation script
 * (`scripts/gate-eval.mjs`) loads it without the environment of the service —
 * `config.ts` refuses to start when a variable is missing, and the script has
 * none of them.
 *
 * Caveat: the measured strict recall on I2P is a LOWER bound of ~36 % (I2P
 * labels images, not prompts), the strict FPR on COCO captions is 6.3 % before
 * the T/C carve-out, obfuscation and fr/es are unmeasured (the 4B and the
 * language runs never finished), and L0 is a blocklist (leetspeak evades it).
 */

/** What the guard said: the three verdicts of the model, and the unread one. */
export type GuardVerdict = 'Safe' | 'Unsafe' | 'Controversial' | 'unparsed';

/** An answer of the guard, read. */
export interface ParsedGuard {
	/** The verdict of the model. */
	verdict: GuardVerdict;
	/** The codes of the categories it named, in the order it named them. */
	codes: string[];
}

/**
 * The categories of the policy of the model, in codes.
 *
 * The words are the ones of the model's own taxonomy; the codes are the ones
 * the slice speaks. The order is the order of the policy, and it matters: the
 * first code whose words are in a category wins (`guard-client.py`).
 */
const CATEGORIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
	V: ['violent', 'violence'],
	N: ['non-violent illegal', 'illegal act'],
	A: ['sexual content', 'sexual act', 'sexually', 'sexual', 'adult content'],
	P: ['pii', 'personally identifiable'],
	S: ['suicide', 'self-harm', 'self harm'],
	U: ['unethical', 'unethical act'],
	T: ['politically sensitive', 'political'],
	C: ['copyright'],
	J: ['jailbreak'],
});

/** The two lines of the answer of the guard. */
const SAFETY = /safety\s*:\s*\**\s*(safe|unsafe|controversial)/i;
const CATEGORIES_LINE = /categories\s*:\s*\**\s*(.*)/i;

/**
 * The codes that pass alone: `T` (politically sensitive) and `C` (copyright).
 *
 * A1's finding 4: the categories of the model are not the categories of the
 * slice, and these two are the ones the slice decides about — they are 8.61 %
 * of the rows of I2P, and four of the 63 false positives on the captions.
 */
export const ALLOWED_CODES: ReadonlySet<string> = new Set(['T', 'C']);

/**
 * The codes of the categories a line names, in the order it names them.
 *
 * A category the table does not know is `?`: the policy refuses it, so an
 * answer nobody understands never waves a prompt through.
 */
function codesOf(text: string): string[] {
	const codes: string[] = [];
	for (const raw of text.toLowerCase().split(/[,;]| and /)) {
		const part = raw.replace(/^[ .*]+/, '').replace(/[ .*]+$/, '');
		if (!part || part === 'none') continue;
		const known = Object.keys(CATEGORIES).find((code) => CATEGORIES[code].some((word) => part.includes(word)));
		if (known) {
			if (!codes.includes(known)) codes.push(known);
			continue;
		}
		if (!codes.includes('?')) codes.push('?');
	}
	return codes;
}

/**
 * The answer of the guard, read.
 *
 * An answer that cannot be read is `unparsed`: the policy refuses it (A1's
 * finding 5 — 0 unparsed answers in 5713 calls, so the slice must never see
 * one, but it must know what to do if it does).
 */
export function parseGuard(reply: string): ParsedGuard {
	const text = String(reply ?? '');
	const safety = SAFETY.exec(text);
	if (!safety) return { verdict: 'unparsed', codes: [] };
	const word = safety[1].toLowerCase();
	const verdict: GuardVerdict = word === 'safe' ? 'Safe' : word === 'unsafe' ? 'Unsafe' : 'Controversial';
	const line = CATEGORIES_LINE.exec(text);
	return { verdict, codes: line ? codesOf(line[1]) : [] };
}

/**
 * Whether the policy refuses the answer of the guard.
 *
 * A1's finding 2: the strict mode (`Unsafe` OR `Controversial`) is the one
 * that works — the loose mode catches 8.02 % of the rows of I2P against
 * 35.98 % for the strict one. A1's finding 4: the categories of the model are
 * not the categories of the slice, so `T` and `C` alone pass. And an answer
 * nobody can read is a refusal: the gate fails closed.
 */
export function guardRefuses(parsed: ParsedGuard): boolean {
	if (parsed.verdict === 'Safe') return false;
	if (parsed.verdict === 'unparsed') return true;
	if (parsed.codes.length === 0) return true;
	return !parsed.codes.every((code) => ALLOWED_CODES.has(code));
}
