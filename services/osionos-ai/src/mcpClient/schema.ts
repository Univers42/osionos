import { createHash } from 'node:crypto';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { compareCodeUnits } from '../order.ts';
import type { RawTool } from './transport.ts';

/**
 * What a server's tool list is allowed to become in our database (C276, C277).
 *
 * A tool is text the model will read one day, written by somebody the user
 * does not control. Nothing here trusts it: control and format characters are
 * stripped, every size is capped, a schema is compiled once with remote
 * references off, and the hash of the three fields is what a later discovery
 * compares to see that a tool changed under the user's feet (C272).
 *
 * A tool that breaks a cap is REFUSED, not trimmed: a cut description is a
 * different instruction from the one the server wrote.
 */

export const MAX_TOOLS = 50;
export const MAX_NAME_CHARS = 128;
export const MAX_DESCRIPTION_BYTES = 1024;
export const MAX_SCHEMA_BYTES = 8192;
export const MAX_SCHEMA_DEPTH = 8;
const MAX_PATTERN_CHARS = 256;

/** A tool that passed every cap, ready for the snapshot. */
export interface StoredTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	sha256: string;
}

export interface Screened {
	tools: StoredTool[];
	/** How many tools broke a cap and were left out. */
	refused: number;
}

/**
 * Drops what a reader cannot see and a model can obey: C0/C1 controls and the
 * format characters (zero-width, bidi overrides, tags). Line breaks and tabs
 * become one space first, so two lines do not glue into one word.
 */
export function sanitizeText(text: string): string {
	return text
		.replace(/[\r\n\t]+/gu, ' ')
		.replace(/[\p{Cc}\p{Cf}]/gu, '')
		.trim();
}

/** The same JSON whatever the order the server wrote the keys in. */
export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const keys = Object.keys(record).sort(compareCodeUnits);
		return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/**
 * The hash of the snapshot: name, description and schema.
 *
 * NUL separates the fields, so ("ab","c") and ("a","bc") do not collide.
 */
export function snapshotHash(name: string, description: string, schema: unknown): string {
	return createHash('sha256').update(`${name}\0${description}\0${canonicalJson(schema)}`).digest('hex');
}

function depthOf(value: unknown, depth = 0): number {
	if (!value || typeof value !== 'object') return depth;
	let deepest = depth + 1;
	for (const child of Array.isArray(value) ? value : Object.values(value)) {
		deepest = Math.max(deepest, depthOf(child, depth + 1));
	}
	return deepest;
}

/**
 * Whether the schema points outside itself or hides a pattern that can hang.
 *
 * Caveat: the pattern check is a heuristic — a length cap and a nested
 * quantifier shape such as (a+)+. A catastrophic pattern written another way
 * passes it; the schema is compiled here but never run against input in this
 * slice, so the cost lands when a later slice validates arguments, and that
 * slice must run patterns under a time limit.
 */
function hasUnsafeParts(value: unknown): boolean {
	if (Array.isArray(value)) return value.some(hasUnsafeParts);
	if (!value || typeof value !== 'object') return false;
	for (const [key, child] of Object.entries(value)) {
		if (key === '$ref' && (typeof child !== 'string' || !child.startsWith('#'))) return true;
		if (key === 'pattern' && typeof child === 'string') {
			if (child.length > MAX_PATTERN_CHARS || /\([^)]*[+*][^)]*\)[+*{]/u.test(child)) return true;
		}
		if (hasUnsafeParts(child)) return true;
	}
	return false;
}

/** Replaces the plaintext of the header wherever a server echoed it into a string. */
export function redactStrings(value: unknown, secret: string): unknown {
	if (!secret) return value;
	if (typeof value === 'string') return value.split(secret).join('[redacted]');
	if (Array.isArray(value)) return value.map((child) => redactStrings(child, secret));
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactStrings(child, secret)]));
	}
	return value;
}

/** Compiles the schema once; a throw means the schema is not one we keep. */
function compiles(schema: Record<string, unknown>): boolean {
	try {
		// A fresh validator per tool: the default instance caches by $id, and one
		// server's $id must never answer for another's.
		new AjvJsonSchemaValidator().getValidator(schema);
		return true;
	} catch {
		return false;
	}
}

/**
 * Whether the arguments fit the stored schema (C277). Checked before the
 * approval is stored AND again at execution.
 *
 * Caveat: the schema was screened for remote references and nested
 * quantifiers, but a pattern that backtracks badly in another shape still
 * runs here without a time limit; the arguments are capped at 64 KiB, which
 * bounds the input, not the pattern.
 */
export function argsFit(schema: Record<string, unknown>, args: unknown): boolean {
	try {
		return new AjvJsonSchemaValidator().getValidator(schema)(args).valid;
	} catch {
		return false;
	}
}

function screenOne(tool: RawTool, secret: string): StoredTool | null {
	const name = sanitizeText(redactStrings(tool.name, secret) as string);
	if (name.length < 1 || name.length > MAX_NAME_CHARS) return null;
	const description = sanitizeText(redactStrings(tool.description ?? '', secret) as string);
	if (Buffer.byteLength(description, 'utf8') > MAX_DESCRIPTION_BYTES) return null;
	const schema = redactStrings(tool.inputSchema, secret) as Record<string, unknown>;
	if (Buffer.byteLength(JSON.stringify(schema), 'utf8') > MAX_SCHEMA_BYTES) return null;
	if (depthOf(schema) > MAX_SCHEMA_DEPTH) return null;
	if (hasUnsafeParts(schema) || !compiles(schema)) return null;
	return { name, description, inputSchema: schema, sha256: snapshotHash(name, description, schema) };
}

/**
 * Screens a listing. The caller has already refused a list above MAX_TOOLS.
 * `secret` is the header plaintext, or '' when the server has none.
 */
export function screenTools(raw: RawTool[], secret: string): Screened {
	const seen = new Set<string>();
	const tools: StoredTool[] = [];
	let refused = 0;
	for (const tool of raw) {
		const stored = screenOne(tool, secret);
		// A duplicate name would overwrite the first: the second is refused.
		if (!stored || seen.has(stored.name)) {
			refused++;
			continue;
		}
		seen.add(stored.name);
		tools.push(stored);
	}
	return { tools, refused };
}
