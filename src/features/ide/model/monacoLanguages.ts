/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   monacoLanguages.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { languages } from "./monacoRuntime";

// One Monaco language id → its grammar loader. Monaco's own `register` modules
// only REGISTER the id with a lazy tokens-provider factory, so the grammar
// itself is fetched on first tokenization; each `import()` below is therefore a
// tiny chunk and the heavy one loads only when a file of that type opens — the
// same per-language chunking the CodeMirror `cmLoad` thunks had. The specifiers
// are static strings on purpose (Vite needs them to split chunks).
const BUILT_IN: Record<string, () => Promise<unknown>> = {
  c: () => import("monaco-editor/languages/definitions/cpp/register"),
  cpp: () => import("monaco-editor/languages/definitions/cpp/register"),
  python: () => import("monaco-editor/languages/definitions/python/register"),
  java: () => import("monaco-editor/languages/definitions/java/register"),
  javascript: () => import("monaco-editor/languages/definitions/javascript/register"),
  typescript: () => import("monaco-editor/languages/definitions/typescript/register"),
  rust: () => import("monaco-editor/languages/definitions/rust/register"),
  go: () => import("monaco-editor/languages/definitions/go/register"),
  php: () => import("monaco-editor/languages/definitions/php/register"),
  sql: () => import("monaco-editor/languages/definitions/sql/register"),
  html: () => import("monaco-editor/languages/definitions/html/register"),
  css: () => import("monaco-editor/languages/definitions/css/register"),
  markdown: () => import("monaco-editor/languages/definitions/markdown/register"),
  xml: () => import("monaco-editor/languages/definitions/xml/register"),
  yaml: () => import("monaco-editor/languages/definitions/yaml/register"),
  shell: () => import("monaco-editor/languages/definitions/shell/register"),
  ruby: () => import("monaco-editor/languages/definitions/ruby/register"),
  lua: () => import("monaco-editor/languages/definitions/lua/register"),
  perl: () => import("monaco-editor/languages/definitions/perl/register"),
  r: () => import("monaco-editor/languages/definitions/r/register"),
  clojure: () => import("monaco-editor/languages/definitions/clojure/register"),
  swift: () => import("monaco-editor/languages/definitions/swift/register"),
  csharp: () => import("monaco-editor/languages/definitions/csharp/register"),
  kotlin: () => import("monaco-editor/languages/definitions/kotlin/register"),
  scala: () => import("monaco-editor/languages/definitions/scala/register"),
  "objective-c": () => import("monaco-editor/languages/definitions/objective-c/register"),
  dart: () => import("monaco-editor/languages/definitions/dart/register"),
  julia: () => import("monaco-editor/languages/definitions/julia/register"),
  powershell: () => import("monaco-editor/languages/definitions/powershell/register"),
  dockerfile: () => import("monaco-editor/languages/definitions/dockerfile/register"),
};

// Grammars Monaco has none for — registered through the public API in the same
// lazy shape (see ideMonarch.ts).
const CUSTOM = new Set(["json", "toml", "haskell", "erlang", "groovy"]);

const loaded = new Map<string, Promise<void>>();

async function registerCustom(monacoId: string): Promise<void> {
  const { MONARCH_DEFINITIONS } = await import("./ideMonarch");
  const def = MONARCH_DEFINITIONS[monacoId];
  if (!def) return;
  languages.register({ id: monacoId, extensions: def.extensions });
  languages.setLanguageConfiguration(monacoId, def.conf);
  languages.setMonarchTokensProvider(monacoId, def.language);
}

/** Make `monacoId` known to Monaco (idempotent, memoized). Resolves once the
 *  language is registered — a model can be switched to it right after. Unknown
 *  ids and "plaintext" resolve immediately: the file stays editable, uncolored. */
export function loadMonacoLanguage(monacoId: string): Promise<void> {
  const existing = loaded.get(monacoId);
  if (existing) return existing;
  const loader = BUILT_IN[monacoId];
  const promise = CUSTOM.has(monacoId)
    ? registerCustom(monacoId)
    : loader ? loader().then(() => undefined) : Promise.resolve();
  loaded.set(monacoId, promise);
  return promise;
}
