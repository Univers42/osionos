/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   access-writers-scan.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Finds the in-process writers of what an access verdict reads, in the bridge sources, and
// says which of them sit under bumpAccessAfter(...). It reads source text; it runs nothing.
//
// A writer is the innermost call around a string that names an access table or function,
// when that call is post/patch/del/upsert/rpc or passes `method: 'POST|PATCH|PUT|DELETE'`.
// A store file that keeps its table in a constant (STORE_FILES) counts every such method.
//
// Caveat: this is a lexer plus bracket matching, not a parser. It misses a writer whose
// table name is built at run time or kept in a constant outside STORE_FILES, and a write
// issued through a helper that takes the table as a variable (under-reporting: a new
// writer of that shape needs a hand-added bump). A regex literal holding a quote can
// derail the lexer; `clean` is false for such a file and the caller must not trust it.

const ACCESS = /osionos_(?:workspace_members|share_rules|workspaces|teams|team_members|pages|workspace_transfer_ownership|workspace_mark_delete|account_erase|bridge_upsert_workspace|member_attributes)\b/g;
const METHOD = /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/g;
const WRITE_CALLS = new Set(['post', 'patch', 'del', 'upsert', 'rpc']);
const STORE_FILES = new Set(['scripts/bridge-perms-rules.mjs', 'scripts/bridge-member-attributes.mjs']);

/**
 * `code`: the source with comments blanked. `shape`: the same with string text blanked to
 * '_' as well, so brackets inside strings never count. Template `${...}` stays code.
 */
export function lex(source) {
	const code = [...source];
	const shape = [...source];
	const braces = [];
	let template = false;
	const mask = (at, to) => { for (let k = at; k < to; k += 1) if (source[k] !== '\n') shape[k] = '_'; };
	const erase = (at, to) => { for (let k = at; k < to; k += 1) if (source[k] !== '\n') { code[k] = ' '; shape[k] = ' '; } };
	let i = 0;
	while (i < source.length) {
		const char = source[i];
		const pair = source.slice(i, i + 2);
		if (template) {
			if (char === '\\') { mask(i, i + 2); i += 2; continue; }
			if (char === '`') { template = false; i += 1; continue; }
			if (pair === '${') { mask(i, i + 2); braces.push(0); template = false; i += 2; continue; }
			mask(i, i + 1); i += 1; continue;
		}
		if (pair === '//' || pair === '/*') {
			const end = pair === '//' ? source.indexOf('\n', i) : source.indexOf('*/', i) + 2;
			const stop = end < i ? source.length : end;
			erase(i, stop); i = stop; continue;
		}
		if (char === '\'' || char === '"') {
			let j = i + 1;
			while (j < source.length && source[j] !== char && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1;
			mask(i + 1, j); i = j + 1; continue;
		}
		if (char === '`') { template = true; i += 1; continue; }
		if (char === '{' && braces.length > 0) braces[braces.length - 1] += 1;
		if (char === '}' && braces.length > 0) {
			if (braces[braces.length - 1] === 0) { braces.pop(); template = true; shape[i] = '_'; i += 1; continue; }
			braces[braces.length - 1] -= 1;
		}
		i += 1;
	}
	return { code: code.join(''), shape: shape.join(''), clean: !template && braces.length === 0 };
}

function closeOf(shape, open) {
	let depth = 0;
	for (let k = open; k < shape.length; k += 1) {
		if ('([{'.includes(shape[k])) depth += 1;
		else if (')]}'.includes(shape[k]) && (depth -= 1) === 0) return k;
	}
	return shape.length - 1;
}

/** The calls enclosing `at`, innermost first: [{ open, callee }]; stops at the statement start. */
function enclosingCalls(shape, at) {
	const calls = [];
	let depth = 0;
	for (let k = at - 1; k >= 0; k -= 1) {
		const char = shape[k];
		if (')]}'.includes(char)) depth += 1;
		else if (char === ';' && depth === 0) break;
		else if ('([{'.includes(char) && depth > 0) depth -= 1;
		else if (char === '(') calls.push({ open: k, callee: /([A-Za-z_$][\w$]*)\s*$/.exec(shape.slice(Math.max(0, k - 80), k))?.[1] ?? '' });
		else if (char === '{' && /(\)|>|\b(?:else|try|finally|do))$/.test(shape.slice(0, k).trimEnd())) break;
	}
	return calls;
}

const lineOf = (source, at) => source.slice(0, at).split('\n').length;
const matches = (regex, text) => [...text.matchAll(regex)].map((found) => found.index);

/** Every writer of an access table in `source`, and whether the lexer read the file to its end. */
export function scanAccessWriters(path, source) {
	const { code, shape, clean } = lex(source);
	const named = matches(ACCESS, code).filter((at) => shape[at] === '_');
	const starts = [...named, ...(STORE_FILES.has(path) ? matches(METHOD, code) : [])].sort((a, b) => a - b);
	const seen = new Set();
	const writers = [];
	for (const at of starts) {
		const calls = enclosingCalls(shape, at);
		if (calls.length === 0 || seen.has(calls[0].open)) continue;
		const { open, callee } = calls[0];
		const text = code.slice(open, closeOf(shape, open) + 1);
		if (!WRITE_CALLS.has(callee) && !new RegExp(METHOD.source).test(text)) continue;
		seen.add(open);
		const bump = calls.find((call) => call.callee === 'bumpAccessAfter');
		// `scope`: what follows the write inside bumpAccessAfter(...), i.e. its second argument.
		const scope = bump ? code.slice(closeOf(shape, open) + 1, closeOf(shape, bump.open)).replace(/\s+/g, ' ').trim() : null;
		writers.push({ line: lineOf(source, open), callee, bumped: Boolean(bump), scope, text: text.replace(/\s+/g, ' ') });
	}
	return { writers, clean };
}

/** True when the source names an access table at all (a file the lexer cannot read must not). */
export const namesAccessTable = (source) => new RegExp(ACCESS.source).test(source);
