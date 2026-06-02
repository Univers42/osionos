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
type LanguageModule = { default: Parameters<Highlighter["registerLanguage"]>[1] };
type Loader = () => Promise<LanguageModule>;

// Each grammar is a package-specifier dynamic import (Vite pre-bundles + code
// splits them), so a code block highlights any of these on demand without
// shipping them in the initial bundle. Covers every mainstream + many niche
// languages; unknown languages degrade to plain escaped text.
const LANGUAGE_LOADERS: Record<string, Loader> = {
  javascript: () => import("highlight.js/lib/languages/javascript"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  python: () => import("highlight.js/lib/languages/python"),
  java: () => import("highlight.js/lib/languages/java"),
  c: () => import("highlight.js/lib/languages/c"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  csharp: () => import("highlight.js/lib/languages/csharp"),
  go: () => import("highlight.js/lib/languages/go"),
  rust: () => import("highlight.js/lib/languages/rust"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  php: () => import("highlight.js/lib/languages/php"),
  swift: () => import("highlight.js/lib/languages/swift"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  scala: () => import("highlight.js/lib/languages/scala"),
  dart: () => import("highlight.js/lib/languages/dart"),
  lua: () => import("highlight.js/lib/languages/lua"),
  perl: () => import("highlight.js/lib/languages/perl"),
  r: () => import("highlight.js/lib/languages/r"),
  julia: () => import("highlight.js/lib/languages/julia"),
  haskell: () => import("highlight.js/lib/languages/haskell"),
  elixir: () => import("highlight.js/lib/languages/elixir"),
  erlang: () => import("highlight.js/lib/languages/erlang"),
  clojure: () => import("highlight.js/lib/languages/clojure"),
  scheme: () => import("highlight.js/lib/languages/scheme"),
  lisp: () => import("highlight.js/lib/languages/lisp"),
  ocaml: () => import("highlight.js/lib/languages/ocaml"),
  fsharp: () => import("highlight.js/lib/languages/fsharp"),
  bash: () => import("highlight.js/lib/languages/bash"),
  powershell: () => import("highlight.js/lib/languages/powershell"),
  dos: () => import("highlight.js/lib/languages/dos"),
  sql: () => import("highlight.js/lib/languages/sql"),
  graphql: () => import("highlight.js/lib/languages/graphql"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  json: () => import("highlight.js/lib/languages/json"),
  xml: () => import("highlight.js/lib/languages/xml"),
  css: () => import("highlight.js/lib/languages/css"),
  scss: () => import("highlight.js/lib/languages/scss"),
  less: () => import("highlight.js/lib/languages/less"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
  makefile: () => import("highlight.js/lib/languages/makefile"),
  ini: () => import("highlight.js/lib/languages/ini"),
  nginx: () => import("highlight.js/lib/languages/nginx"),
  apache: () => import("highlight.js/lib/languages/apache"),
  diff: () => import("highlight.js/lib/languages/diff"),
  http: () => import("highlight.js/lib/languages/http"),
  protobuf: () => import("highlight.js/lib/languages/protobuf"),
  groovy: () => import("highlight.js/lib/languages/groovy"),
  objectivec: () => import("highlight.js/lib/languages/objectivec"),
  matlab: () => import("highlight.js/lib/languages/matlab"),
  vbnet: () => import("highlight.js/lib/languages/vbnet"),
};

const ALIASES: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", sh: "bash", shell: "bash", zsh: "bash",
  yml: "yaml", md: "markdown", htm: "xml", html: "xml", svg: "xml", vue: "xml",
  "c++": "cpp", cc: "cpp", "c#": "csharp", cs: "csharp", py: "python",
  rb: "ruby", rs: "rust", kt: "kotlin", toml: "ini", golang: "go", bat: "dos",
  "objective-c": "objectivec", "obj-c": "objectivec", "f#": "fsharp",
  ps1: "powershell", gql: "graphql", text: "", plaintext: "",
};

let corePromise: Promise<Highlighter> | null = null;
const registered = new Set<string>();
const pending = new Map<string, Promise<void>>();

export function normalizeLanguage(language?: string): string | null {
  const raw = (language ?? "").trim().toLowerCase();
  if (!raw || raw === "plaintext" || raw === "text") return null;
  const mapped = ALIASES[raw];
  return mapped === "" ? null : (mapped ?? raw);
}

/**
 * Load highlight.js core plus the grammar for `language` (registered once).
 * Unknown / unsupported languages resolve to core only, so the caller falls
 * back to plain escaped text without throwing.
 */
export async function loadHighlighterFor(language: string | null): Promise<Highlighter> {
  corePromise ??= import("highlight.js/lib/core").then((module) => module.default);
  const hljs = await corePromise;
  if (!language || registered.has(language)) return hljs;

  if (!pending.has(language)) {
    const loader = LANGUAGE_LOADERS[language];
    const task = loader
      ? loader()
          .then((module) => hljs.registerLanguage(language, module.default))
          .catch(() => undefined)
      : Promise.resolve();
    pending.set(language, task.then(() => { registered.add(language); }));
  }
  await pending.get(language);
  return hljs;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
