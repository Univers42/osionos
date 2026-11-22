/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   appCsp.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The app shell's Content-Security-Policy lives once, in docker/services/node/nginx.conf, as the
// `$app_csp_report_only` map (#314). Everything else (`vite preview`, the tests) reads it from there
// through this file, so a copy can never drift from what the web image sends.
//
// Caveat: regexes, not an nginx parser. readPolicy needs the map to be `map $uri $app_csp_report_only`
// with one `default "...";` line and no `"` inside the value; locationsWithAddHeader finds a block's
// end by counting braces, so a `{` or `}` inside a quoted string or a comment would misplace it.
// Both fail loudly (null, or a test that no longer matches) rather than reading a wrong policy.

import { createHash } from "node:crypto";

export const POLICY_VARIABLE = "app_csp_report_only";

const POLICY_MAP = new RegExp(
  String.raw`map\s+\$uri\s+\$${POLICY_VARIABLE}\s*\{\s*default\s+"([^"]*)"\s*;\s*\}`,
);

export function readPolicy(nginxConf: string): string | null {
  return POLICY_MAP.exec(nginxConf)?.[1] ?? null;
}

export interface Block {
  header: string;
  body: string;
}

/** Every `server` and `location` block that declares at least one add_header, outermost first. */
export function blocksWithAddHeader(nginxConf: string): Block[] {
  const found: Block[] = [];
  const opener = /(^|\n)\s*(server\s*|location[^{;]*)\{/g;
  for (let m = opener.exec(nginxConf); m; m = opener.exec(nginxConf)) {
    const body = blockBody(nginxConf, opener.lastIndex);
    if (/\badd_header\b/.test(stripNested(body))) found.push({ header: m[2].trim(), body });
  }
  return found;
}

function blockBody(text: string, from: number): string {
  let depth = 1;
  let i = from;
  for (; i < text.length && depth > 0; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") depth -= 1;
  }
  return text.slice(from, i - 1);
}

// A server block's own add_header lines are the ones outside its locations.
function stripNested(body: string): string {
  let out = "";
  let depth = 0;
  for (const ch of body) {
    if (ch === "{") depth += 1;
    if (depth === 0) out += ch;
    if (ch === "}") depth -= 1;
  }
  return out;
}

/** The add_header lines a block declares itself (not its locations'). */
export function ownAddHeaders(block: Block): string[] {
  return stripNested(block.body).split("\n").filter((line) => /^\s*add_header\b/.test(line));
}

/** sha256 CSP sources for every inline `<script>` in an HTML document. */
export function inlineScriptSources(html: string): string[] {
  const scripts = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  return [...html.matchAll(scripts)].map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
}

/** The headers `vite preview` sends so a production-build e2e run checks a real policy: the nginx
 *  string itself, as Report-Only, or as the enforced header when `enforce` (PLAYWRIGHT_CSP=enforce). */
export function previewHeaders(nginxConf: string, enforce: boolean): Record<string, string> {
  const policy = readPolicy(nginxConf);
  if (policy === null) throw new Error(`nginx.conf has no app_csp_report_only map`);
  return { [enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"]: policy };
}
