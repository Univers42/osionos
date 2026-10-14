/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   frontMatter.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type FrontMatterMeta = Record<string, unknown>;

export interface SplitFrontMatter {
  meta: FrontMatterMeta;
  body: string;
  error: string | null;
  present: boolean;
}

/** Valid key pattern: starts with letter or underscore, then alphanumeric/underscore. */
export const FRONT_MATTER_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Validates a key for front-matter use. Throws TypeError on invalid key. */
function validateKey(key: string): void {
  if (!FRONT_MATTER_KEY_RE.test(key)) {
    throw new TypeError(`Invalid front-matter key: ${key}`);
  }
  if (FORBIDDEN_KEYS.has(key)) {
    throw new TypeError(`Forbidden front-matter key: ${key}`);
  }
}

/**
 * Joins front-matter meta and body into an .omd file string.
 * O(m log m + b) where m = number of keys, b = body length.
 * Keys are sorted for deterministic output.
 */
export function joinFrontMatter(meta: FrontMatterMeta, body: string): string {
  const keys = Object.keys(meta).filter((k) => {
    const v = meta[k];
    return v !== undefined && JSON.stringify(v) !== undefined;
  });

  keys.sort();

  for (const key of keys) {
    validateKey(key);
  }

  let result = "---\n";
  for (const key of keys) {
    const value = meta[key];
    result += `${key}: ${JSON.stringify(value)}\n`;
  }
  result += "---\n";

  if (body === "") {
    return result;
  }
  return result + "\n" + body;
}

function notFrontMatter(text: string, error: string | null): SplitFrontMatter {
  return { meta: {}, body: text, error, present: false };
}

type MetaLine = { key: string; value: unknown } | { what: string };

/** One `key: <JSON>` line → its pair, or what is wrong with it (split on the FIRST ": "). */
function parseMetaLine(line: string, seen: ReadonlySet<string>): MetaLine {
  const sep = line.indexOf(": ");
  if (sep === -1) return { what: 'missing ": "' };
  const key = line.slice(0, sep);
  if (!FRONT_MATTER_KEY_RE.test(key)) return { what: `bad key: ${key}` };
  if (FORBIDDEN_KEYS.has(key)) return { what: `forbidden key: ${key}` };
  if (seen.has(key)) return { what: `duplicate key: ${key}` };
  try {
    const value: unknown = JSON.parse(line.slice(sep + 2));
    return { key, value };
  } catch {
    return { what: "invalid JSON" };
  }
}

/** Skips the one "\n" or "\r\n" separator joinFrontMatter writes after the closing fence. */
function bodyStartAfter(text: string, pos: number): number {
  if (text.startsWith("\n", pos)) return pos + 1;
  return text.startsWith("\r\n", pos) ? pos + 2 : pos;
}

/**
 * Splits an .omd file into front-matter meta and body. Never throws: any malformed block keeps
 * the WHOLE text as body (hand-edited files are a trust boundary; the user's text is never lost).
 * O(n): one forward indexOf pass that stops at the closing fence — a large body is sliced once.
 */
export function splitFrontMatter(text: string): SplitFrontMatter {
  const crlf = text.startsWith("---\r\n");
  if (!crlf && !text.startsWith("---\n")) return notFrontMatter(text, null);
  const meta: FrontMatterMeta = {};
  const seen = new Set<string>();
  let pos = crlf ? 5 : 4;
  for (let lineNumber = 2; pos <= text.length; lineNumber++) {
    const newline = text.indexOf("\n", pos);
    const end = newline === -1 ? text.length : newline;
    const raw = text.slice(pos, end);
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    pos = end + 1;
    if (line === "---") return { meta, body: text.slice(bodyStartAfter(text, pos)), error: null, present: true };
    if (line.trim() === "") continue;
    const parsed = parseMetaLine(line, seen);
    if ("what" in parsed) return notFrontMatter(text, `front-matter line ${lineNumber}: ${parsed.what}`);
    meta[parsed.key] = parsed.value;
    seen.add(parsed.key);
  }
  return notFrontMatter(text, "front-matter: no closing ---");
}
