import { createHash } from 'node:crypto';

/**
 * The canonical form of the arguments of a call, and its hash.
 *
 * The hash is the duplicate key of an approval: two calls of the same run with
 * the same arguments are the SAME call, and the second one is refused. The
 * canonical form is what makes that true: the keys are sorted, everywhere, so
 * two calls that differ only in the order of their keys hash the same.
 */

/**
 * The canonical JSON of a value: the keys sorted, at every depth.
 *
 * The undefined values are dropped, the way JSON.stringify drops them: a key
 * whose value is undefined is not a key of the object.
 */
export function canonicalJson(value: unknown): string {
	if (value === undefined) return 'null';
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, entry]) => entry !== undefined)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
	return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

/** The hash of the arguments of a call: the duplicate key of an approval. */
export function argsSha256(args: unknown): string {
	return createHash('sha256').update(canonicalJson(args), 'utf8').digest('hex');
}
