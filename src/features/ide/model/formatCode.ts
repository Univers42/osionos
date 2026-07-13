/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   formatCode.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { API_BASE, getActivePageJwt } from "@/shared/api/client";

/**
 * Auto-format ("prettier mode"). Two backends, chosen by language:
 *  - In-browser Prettier for the web languages — works with NO runner, no
 *    server gate, so formatting is always available for JS/TS/CSS/HTML/JSON/
 *    Markdown/YAML.
 *  - The sandboxed runner (`/api/ide/format`, gated) for Python (black) and
 *    C/C++ (clang-format).
 *
 * Prettier plugins are dynamic-imported with STATIC string literals so Vite
 * splits each into its own chunk (a template-string import would not bundle).
 */

// Static loaders — one chunk each, loaded only when that language is formatted.
const PLUGIN_LOADERS = {
  babel: () => import("prettier/plugins/babel"),
  estree: () => import("prettier/plugins/estree"),
  typescript: () => import("prettier/plugins/typescript"),
  postcss: () => import("prettier/plugins/postcss"),
  html: () => import("prettier/plugins/html"),
  markdown: () => import("prettier/plugins/markdown"),
  yaml: () => import("prettier/plugins/yaml"),
} as const;

type PluginName = keyof typeof PLUGIN_LOADERS;

const BROWSER_FORMAT: Record<string, { parser: string; plugins: PluginName[] }> = {
  javascript: { parser: "babel", plugins: ["babel", "estree"] },
  typescript: { parser: "typescript", plugins: ["typescript", "estree"] },
  css: { parser: "css", plugins: ["postcss"] },
  html: { parser: "html", plugins: ["html", "babel", "estree", "postcss"] },
  json: { parser: "json", plugins: ["babel", "estree"] },
  markdown: { parser: "markdown", plugins: ["markdown"] },
  yaml: { parser: "yaml", plugins: ["yaml"] },
};

// Must match the runner's FORMATTERS (server.mjs). Needs the runner enabled.
const RUNNER_FORMAT_LANGS = new Set(["python", "c", "cpp"]);

export function canFormat(languageId: string): boolean {
  return languageId in BROWSER_FORMAT || RUNNER_FORMAT_LANGS.has(languageId);
}

async function formatInBrowser(languageId: string, source: string): Promise<string> {
  const spec = BROWSER_FORMAT[languageId];
  const { format } = await import("prettier/standalone");
  const plugins = await Promise.all(
    spec.plugins.map((p) => PLUGIN_LOADERS[p]().then((m) => (m as { default?: unknown }).default ?? m)),
  );
  return format(source, { parser: spec.parser, plugins });
}

async function formatViaRunner(languageId: string, source: string): Promise<string> {
  const jwt = getActivePageJwt();
  if (!API_BASE || !jwt) throw new Error("Not signed in.");
  const res = await fetch(`${API_BASE}/api/ide/format`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ language: languageId, source }),
  });
  if (res.status === 404) throw new Error("Formatter not enabled on the server.");
  const data = (await res.json().catch(() => ({}))) as { formatted?: string; message?: string };
  if (!res.ok || typeof data.formatted !== "string") throw new Error(data.message || `Format failed (${res.status}).`);
  return data.formatted;
}

/** Format `source` for `languageId`. Browser Prettier where possible, else the
 *  runner. Throws with a readable message on unsupported language / syntax error. */
export async function formatCode(languageId: string, source: string): Promise<string> {
  if (languageId in BROWSER_FORMAT) return formatInBrowser(languageId, source);
  if (RUNNER_FORMAT_LANGS.has(languageId)) return formatViaRunner(languageId, source);
  throw new Error(`No formatter available for ${languageId}.`);
}
