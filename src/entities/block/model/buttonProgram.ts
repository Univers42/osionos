/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   buttonProgram.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The program a button block carries: a JSON AST and the strict parser that
 * is its only gate. Imports nothing, so a plain-node test can load it.
 *
 * Caveat: the limits below bound size and nesting, not meaning: a parsed
 * program can still loop or write, which the interpreter's budgets bound.
 */

export type ProgramValue = string | number | boolean | null | { formula: string };

export type ProgramAction =
	| { type: "notify"; message: ProgramValue }
	| { type: "set_property"; property: string; value: ProgramValue };

export type ProgramStep =
	| { op: "set"; name: string; value: ProgramValue }
	| { op: "if"; condition: ProgramValue; then: ProgramStep[]; else?: ProgramStep[] }
	| { op: "repeat"; count: ProgramValue; steps: ProgramStep[] }
	| { op: "forEach"; items: ProgramValue; as: string; steps: ProgramStep[] }
	| { op: "action"; action: ProgramAction };

export interface ButtonProgram {
	version: 1;
	steps: ProgramStep[];
}

export type ParseResult =
	| { ok: true; program: ButtonProgram }
	| { ok: false; error: { path: string; message: string } };

export const PROGRAM_LIMITS = {
	depth: 8,
	nodes: 500,
	stringChars: 2_000,
	nameChars: 64,
	serializedBytes: 64 * 1024,
} as const;

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Explicit fields, not constructor parameter properties: the canvas runner strips types only.
class ParseFailure {
	readonly path: string;
	readonly message: string;
	constructor(path: string, message: string) {
		this.path = path;
		this.message = message;
	}
}

const fail = (path: string, message: string): never => {
	throw new ParseFailure(path, message);
};

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

function asRecord(input: unknown, path: string): Record<string, unknown> {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return fail(path, "expected an object");
	}
	return input as Record<string, unknown>;
}

function checkKeys(record: Record<string, unknown>, path: string, required: string[], optional: string[] = []): void {
	for (const key of Object.keys(record)) {
		if (!required.includes(key) && !optional.includes(key)) fail(join(path, key), `unknown key "${key}"`);
	}
	for (const key of required) {
		if (!(key in record)) fail(join(path, key), `missing "${key}"`);
	}
}

function parseText(input: unknown, path: string, max: number = PROGRAM_LIMITS.stringChars): string {
	if (typeof input !== "string") return fail(path, "expected a string");
	if (input.length > max) return fail(path, `longer than ${max} characters`);
	return input;
}

function parseName(input: unknown, path: string): string {
	const name = parseText(input, path, PROGRAM_LIMITS.nameChars);
	if (!NAME_PATTERN.test(name)) fail(path, "a name is letters, digits and _, not starting with a digit");
	return name;
}

function parseValue(input: unknown, path: string): ProgramValue {
	if (typeof input === "string") return parseText(input, path);
	if (typeof input === "number") return Number.isFinite(input) ? input : fail(path, "expected a finite number");
	if (typeof input === "boolean" || input === null) return input;
	const record = asRecord(input, path);
	checkKeys(record, path, ["formula"]);
	return { formula: parseText(record.formula, join(path, "formula")) };
}

function parseAction(input: unknown, path: string): ProgramAction {
	const record = asRecord(input, path);
	if (record.type === "notify") {
		checkKeys(record, path, ["type", "message"]);
		return { type: "notify", message: parseValue(record.message, join(path, "message")) };
	}
	if (record.type === "set_property") {
		checkKeys(record, path, ["type", "property", "value"]);
		const property = parseText(record.property, join(path, "property"));
		if (!property) fail(join(path, "property"), "a property needs a name");
		return { type: "set_property", property, value: parseValue(record.value, join(path, "value")) };
	}
	return fail(join(path, "type"), "unknown action type");
}

interface Walk {
	nodes: number;
}

function parseSteps(input: unknown, path: string, depth: number, walk: Walk): ProgramStep[] {
	if (!Array.isArray(input)) return fail(path, "expected a list of steps");
	if (depth > PROGRAM_LIMITS.depth) fail(path, `nested deeper than ${PROGRAM_LIMITS.depth}`);
	walk.nodes += input.length;
	if (walk.nodes > PROGRAM_LIMITS.nodes) fail(path, `more than ${PROGRAM_LIMITS.nodes} steps`);
	return input.map((step, index) => parseStep(step, `${path}[${index}]`, depth, walk));
}

function parseStep(input: unknown, path: string, depth: number, walk: Walk): ProgramStep {
	const record = asRecord(input, path);
	const sub = (key: string) => parseSteps(record[key], join(path, key), depth + 1, walk);
	switch (record.op) {
		case "set":
			checkKeys(record, path, ["op", "name", "value"]);
			return { op: "set", name: parseName(record.name, join(path, "name")), value: parseValue(record.value, join(path, "value")) };
		case "if": {
			checkKeys(record, path, ["op", "condition", "then"], ["else"]);
			const step: ProgramStep = { op: "if", condition: parseValue(record.condition, join(path, "condition")), then: sub("then") };
			if (record.else !== undefined) step.else = sub("else");
			return step;
		}
		case "repeat":
			checkKeys(record, path, ["op", "count", "steps"]);
			return { op: "repeat", count: parseValue(record.count, join(path, "count")), steps: sub("steps") };
		case "forEach":
			checkKeys(record, path, ["op", "items", "as", "steps"]);
			return {
				op: "forEach",
				items: parseValue(record.items, join(path, "items")),
				as: parseName(record.as, join(path, "as")),
				steps: sub("steps"),
			};
		case "action":
			checkKeys(record, path, ["op", "action"]);
			return { op: "action", action: parseAction(record.action, join(path, "action")) };
		default:
			return fail(join(path, "op"), "unknown op");
	}
}

/** Total: any input, however hostile, comes back as a result and never throws. */
export function parseButtonProgram(input: unknown): ParseResult {
	try {
		const record = asRecord(input, "");
		checkKeys(record, "", ["version", "steps"]);
		if (record.version !== 1) fail("version", "only version 1 is supported");
		const program: ButtonProgram = { version: 1, steps: parseSteps(record.steps, "steps", 1, { nodes: 0 }) };
		if (JSON.stringify(program).length > PROGRAM_LIMITS.serializedBytes) fail("", "program is larger than 64 KB");
		return { ok: true, program };
	} catch (error) {
		if (error instanceof ParseFailure) return { ok: false, error: { path: error.path, message: error.message } };
		return { ok: false, error: { path: "", message: "program could not be read" } };
	}
}
