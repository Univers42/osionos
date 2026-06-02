/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   highlighter.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type hljsCore from "highlight.js/lib/core";

export type Highlighter = typeof hljsCore;

let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Lazily load highlight.js (core + the supported languages, ~270 KiB) on first
 * use. The result is cached so every code block shares one registered instance
 * and the bundle stays out of the initial critical path.
 */
export function loadHighlighter(): Promise<Highlighter> {
  if (highlighterPromise) return highlighterPromise;

  highlighterPromise = (async () => {
    const [{ default: hljs }, languages] = await Promise.all([
      import("highlight.js/lib/core"),
      Promise.all([
        import("highlight.js/lib/languages/javascript"),
        import("highlight.js/lib/languages/typescript"),
        import("highlight.js/lib/languages/python"),
        import("highlight.js/lib/languages/rust"),
        import("highlight.js/lib/languages/cpp"),
        import("highlight.js/lib/languages/c"),
        import("highlight.js/lib/languages/java"),
        import("highlight.js/lib/languages/go"),
        import("highlight.js/lib/languages/xml"),
        import("highlight.js/lib/languages/css"),
        import("highlight.js/lib/languages/json"),
        import("highlight.js/lib/languages/yaml"),
        import("highlight.js/lib/languages/markdown"),
        import("highlight.js/lib/languages/bash"),
        import("highlight.js/lib/languages/sql"),
        import("highlight.js/lib/languages/ruby"),
        import("highlight.js/lib/languages/php"),
        import("highlight.js/lib/languages/swift"),
        import("highlight.js/lib/languages/kotlin"),
        import("highlight.js/lib/languages/lua"),
        import("highlight.js/lib/languages/ini"),
      ]),
    ]);

    const [js, ts, py, rs, cpp, c, java, go, xml, css, json, yaml, md, bash, sql, ruby, php, swift, kotlin, lua, ini] =
      languages.map((module) => module.default);

    const registry: Array<[string, (typeof js)]> = [
      ["javascript", js], ["typescript", ts], ["python", py], ["rust", rs],
      ["cpp", cpp], ["c", c], ["java", java], ["go", go], ["html", xml],
      ["xml", xml], ["css", css], ["json", json], ["yaml", yaml],
      ["markdown", md], ["bash", bash], ["sql", sql], ["ruby", ruby],
      ["php", php], ["swift", swift], ["kotlin", kotlin], ["lua", lua],
      ["toml", ini],
    ];
    for (const [name, fn] of registry) hljs.registerLanguage(name, fn);

    return hljs;
  })();

  return highlighterPromise;
}

export function normalizeLanguage(language?: string): string | null {
  const raw = (language ?? "plaintext").trim().toLowerCase();

  if (raw === "plaintext" || raw === "text") return null;
  if (raw === "ts") return "typescript";
  if (raw === "js") return "javascript";
  if (raw === "sh" || raw === "shell") return "bash";
  if (raw === "yml") return "yaml";
  if (raw === "md") return "markdown";
  if (raw === "htm") return "html";

  return raw;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
